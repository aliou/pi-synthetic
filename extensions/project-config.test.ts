import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ConfigStore } from "@aliou/pi-utils-settings";
import type { Provider } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import {
  createEventBus,
  discoverAndLoadExtensions,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DEFAULT_SYNTHETIC_API_BASE_URL } from "../src/client";
import {
  configLoader,
  type ResolvedSyntheticConfig,
  type SyntheticConfig,
  seedSyntheticConfigIfMissing,
} from "../src/config";
import commandQuotas from "./command-quotas";
import provider from "./provider";
import quotaWarnings from "./quota-warnings";
import usageStatus from "./usage-status";
import webSearch from "./web-search";
import { syntheticWebSearchTool } from "./web-search/tool";

const directory = vi.hoisted(() => {
  const path = `${process.cwd()}/.direnv/synthetic-config-${process.pid}`;
  vi.stubEnv("PI_CODING_AGENT_DIR", `${path}/agent`);
  return path;
});
const extensions = {
  provider,
  "web-search": webSearch,
  "command-quotas": commandQuotas,
  "quota-warnings": quotaWarnings,
  "usage-status": usageStatus,
};
let project: string;
let localPath: string;
const globalProxy = "https://global.example";
const localProxy = "https://project.example";
const localConfig = JSON.stringify({
  proxyUrl: localProxy,
  api: "anthropic-messages",
  quotasCommand: false,
  subBarIntegration: true,
});

beforeEach(async () => {
  project = resolve(directory, "project");
  const agent = resolve(directory, "agent");
  await mkdir(resolve(project, ".pi/extensions"), { recursive: true });
  await mkdir(resolve(agent, "extensions"), { recursive: true });
  localPath = resolve(project, ".pi/extensions/synthetic.json");
  await writeFile(localPath, localConfig);
  await writeFile(
    resolve(agent, "extensions/synthetic.json"),
    JSON.stringify({ proxyUrl: globalProxy }),
  );
  vi.spyOn(process, "cwd").mockReturnValue(project);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 403 })),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

afterAll(() => vi.unstubAllEnvs());

function createRuntime(trusted: boolean) {
  const handlers = new Map<
    string,
    Array<(event: never, ctx: ExtensionContext) => unknown>
  >();
  const listeners = new Map<string, Array<(data: unknown) => unknown>>();
  const commands = new Map<
    string,
    Parameters<ExtensionAPI["registerCommand"]>[1]
  >();
  const notify = vi.fn();
  const ctx = {
    cwd: project,
    isProjectTrusted: () => trusted,
    modelRegistry: { getApiKeyForProvider: async () => "test-key" },
    ui: { notify, custom: async () => undefined },
    hasUI: false,
    tools: [],
    executeTool: vi.fn(),
  } as unknown as ExtensionToolContext;
  const pi = {
    on: (
      name: string,
      handler: (event: never, ctx: ExtensionContext) => unknown,
    ) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    events: {
      on: (name: string, handler: (data: unknown) => unknown) => {
        listeners.set(name, [...(listeners.get(name) ?? []), handler]);
      },
      emit: (name: string, data: unknown) => {
        for (const handler of listeners.get(name) ?? []) void handler(data);
      },
    },
    registerProvider: vi.fn<(provider: Provider) => void>(),
    registerCommand: (
      name: string,
      command: Parameters<ExtensionAPI["registerCommand"]>[1],
    ) => commands.set(name, command),
    registerTool: vi.fn(),
    getAllTools: () => [],
    getActiveTools: () => [],
    setActiveTools: vi.fn(),
  };
  return {
    pi,
    ctx,
    commands,
    notify,
    emit: async (name: string) => {
      for (const handler of handlers.get(name) ?? [])
        await handler({} as never, ctx);
    },
    requestQuotas: async () => {
      await Promise.all(
        (listeners.get("synthetic:quotas:request") ?? []).map((handler) =>
          handler(undefined),
        ),
      );
    },
  };
}

it.each([
  false,
  true,
])("propagates provider settings saves to an independently loaded quotas command starting enabled=%s", async (initiallyEnabled) => {
  await writeFile(
    resolve(directory, "agent/extensions/synthetic.json"),
    JSON.stringify({ proxyUrl: globalProxy, quotasCommand: initiallyEnabled }),
  );
  const runtime = createRuntime(false);
  const loaded = await discoverAndLoadExtensions(
    [
      resolve(directory, "../../extensions/provider/index.ts"),
      resolve(directory, "../../extensions/command-quotas/index.ts"),
    ],
    project,
    resolve(directory, "agent"),
    createEventBus(),
  );
  expect(loaded.errors).toEqual([]);
  for (const extension of loaded.extensions) {
    for (const handler of extension.handlers.get("session_start") ?? []) {
      await handler({ type: "session_start" }, runtime.ctx);
    }
  }
  const settings = loaded.extensions[0]?.commands.get("synthetic:settings");
  const command = loaded.extensions[1]?.commands.get("synthetic:quotas");
  expect(settings).toBeDefined();
  expect(command).toBeDefined();
  initTheme("dark", false);
  let store!: ConfigStore<SyntheticConfig, ResolvedSyntheticConfig>;
  let save!: (ctx: ExtensionCommandContext) => Promise<void>;
  const context = {
    ...runtime.ctx,
    hasUI: true,
    ui: {
      ...runtime.ctx.ui,
      custom: async (factory: (...args: never[]) => object) => {
        const panel = factory(
          { requestRender: vi.fn() } as never,
          { fg: (_color: string, text: string) => text } as never,
          {} as never,
          vi.fn() as never,
        );
        store = Reflect.get(panel, "configStore");
        save = Reflect.get(panel, "onSave");
      },
    },
  } as unknown as ExtensionCommandContext;
  await settings?.handler("", context);
  for (const enabled of [
    !initiallyEnabled,
    initiallyEnabled,
    !initiallyEnabled,
  ]) {
    await store.save("global", {
      ...store.getRawConfig("global"),
      quotasCommand: enabled,
      proxyUrl: localProxy,
      proxyRequiresAuth: false,
    });
    await save(context);
    vi.mocked(fetch).mockClear();
    await command?.handler("", runtime.ctx as never);
    expect(fetch).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (enabled) {
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
        `${localProxy}/v2/quotas`,
      );
      expect(
        new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).has(
          "Authorization",
        ),
      ).toBe(false);
    }
  }
});

it("uses the default API without a global proxy in an untrusted project", async () => {
  await rm(resolve(directory, "agent/extensions/synthetic.json"));
  const runtime = createRuntime(false);
  await webSearch(runtime.pi as unknown as ExtensionAPI);
  await runtime.emit("session_start");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
    `${DEFAULT_SYNTHETIC_API_BASE_URL}/v2/quotas`,
  );
  await runtime.emit("session_shutdown");
});

it("seeds global defaults without applying the project file", async () => {
  await rm(resolve(directory, "agent/extensions/synthetic.json"));
  await configLoader.load();
  await seedSyntheticConfigIfMissing();
  const globalFile = await readFile(
    resolve(directory, "agent/extensions/synthetic.json"),
    "utf8",
  );
  const projectFile = await readFile(localPath, "utf8");
  expect(JSON.parse(globalFile).proxyUrl).toBe("");
  expect(projectFile).toBe(localConfig);
});

describe.each([
  ["quotaWarnings", quotaWarnings],
  ["usageStatus", usageStatus],
] as const)("%s startup setting", (setting, extension) => {
  it.each([
    false,
    true,
  ])("uses the trusted setting when trusted=%s", async (trusted) => {
    await writeFile(localPath, JSON.stringify({ [setting]: true }));
    const runtime = createRuntime(trusted);
    runtime.ctx.model = { provider: "synthetic" } as never;
    const read = vi.fn();
    runtime.pi.events.on("synthetic:quotas:read", read);
    await extension(runtime.pi as unknown as ExtensionAPI);
    await runtime.emit("session_start");
    expect(read).toHaveBeenCalledTimes(trusted ? 1 : 0);
    await runtime.emit("session_shutdown");
  });
});

it("uses connection updates without sharing the settings loader", async () => {
  const runtime = createRuntime(false);
  await webSearch(runtime.pi as unknown as ExtensionAPI);
  await runtime.emit("session_start");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  runtime.pi.events.emit("synthetic:config:updated", {
    config: {
      ...configLoader.getConfig(),
      proxyUrl: localProxy,
      proxyRequiresAuth: false,
    },
  });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(configLoader.getConfig().proxyUrl).toBe(globalProxy);
  expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(`${localProxy}/v2/quotas`);
  expect(
    new Headers(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).has(
      "Authorization",
    ),
  ).toBe(false);
  await runtime.emit("session_shutdown");
});

describe.each(
  Object.entries(extensions),
)("%s project config", (entrypoint, extension) => {
  it.each([
    false,
    true,
  ])("applies project settings only when trusted=%s", async (trusted) => {
    const runtime = createRuntime(trusted);
    await extension(runtime.pi as unknown as ExtensionAPI);
    const setupProxy = configLoader.getConfig().proxyUrl;
    const setupFile = await readFile(localPath, "utf8");

    await runtime.emit("session_start");
    if (entrypoint === "provider") {
      await runtime.requestQuotas();
      const registrations = runtime.pi.registerProvider.mock.calls;
      expect(registrations).toHaveLength(trusted ? 2 : 1);
      expect(registrations[0]?.[0].getModels()[0]?.api).toBe(
        "openai-completions",
      );
      expect(registrations.at(-1)?.[0].getModels()[0]?.api).toBe(
        trusted ? "anthropic-messages" : "openai-completions",
      );
    }
    if (entrypoint === "provider" || entrypoint === "web-search") {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
        `${trusted ? localProxy : globalProxy}/v2/quotas`,
      );
      expect(
        new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get(
          "Authorization",
        ),
      ).toBe("Bearer test-key");
    }
    if (entrypoint === "web-search") {
      await expect(
        syntheticWebSearchTool.execute(
          "search",
          { query: "test" },
          undefined,
          undefined,
          runtime.ctx,
        ),
      ).rejects.toThrow();
      expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(
        `${trusted ? localProxy : globalProxy}/v2/search`,
      );
    }
    expect(setupProxy).toBe(globalProxy);
    expect(setupFile).toBe(localConfig);
    expect(configLoader.getConfig().proxyUrl).toBe(
      trusted ? localProxy : globalProxy,
    );
    if (entrypoint === "command-quotas") {
      const command = runtime.commands.get("synthetic:quotas");
      expect(command).toBeDefined();
      await command?.handler("", runtime.ctx as never);
      if (trusted) {
        expect(fetch).not.toHaveBeenCalled();
        expect(runtime.notify).toHaveBeenCalledWith(
          expect.stringContaining("disabled"),
          "warning",
        );
      } else {
        expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(
          `${globalProxy}/v2/quotas`,
        );
      }
    }
    const savedFile = await readFile(localPath, "utf8");
    if (!trusted) {
      expect(savedFile).toBe(localConfig);
      expect(runtime.notify).toHaveBeenCalledWith(
        `Ignored ${localPath}: project not trusted. Use /trust and restart Pi to apply it.`,
        "warning",
      );
      await expect(configLoader.save("local", {})).rejects.toThrow(
        "not trusted",
      );
    } else {
      expect(JSON.parse(savedFile)).not.toHaveProperty("subBarIntegration");
    }
    await runtime.emit("session_shutdown");
  });
});
