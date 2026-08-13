import type {
  ModelsStoreEntry,
  ProviderAuthInteraction,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { SyntheticApiModel } from "../../src/client/types";
import type { SyntheticModel } from "./models";
import {
  createSyntheticProvider,
  SYNTHETIC_API_KEY_ENV,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
} from "./provider";
import type { FetchSyntheticApiModels } from "./refresh-models";

const staticModels: SyntheticModel[] = [
  {
    id: "syn:static",
    name: "syn:static",
    reasoning: false,
    input: ["text"],
    cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  },
];

const identityBuild = (models: readonly unknown[]) =>
  models as unknown as SyntheticModel[];

const fetchedModel = {
  id: "syn:fetched",
  name: "syn:fetched",
} as unknown as SyntheticApiModel;

function createProvider(
  options: { fetchApiModels?: FetchSyntheticApiModels } = {},
) {
  const fetchApiModels = vi.fn<FetchSyntheticApiModels>(
    options.fetchApiModels ?? (async () => [fetchedModel]),
  );
  const provider = createSyntheticProvider(
    staticModels,
    fetchApiModels,
    identityBuild,
    identityBuild,
  );
  return { provider, fetchApiModels };
}

function createContext(
  options: {
    allowNetwork?: boolean;
    credential?: { type: "api_key"; key: string };
    stored?: ModelsStoreEntry;
    signal?: AbortSignal;
  } = {},
): RefreshModelsContext {
  const publish = vi.fn(
    async (publication: {
      persist?: ModelsStoreEntry | null;
      update?: () => void;
    }): Promise<boolean> => {
      publication.update?.();
      return true;
    },
  );

  return {
    credential: options.credential,
    allowNetwork: options.allowNetwork ?? true,
    force: false,
    signal: options.signal ?? new AbortController().signal,
    stored: options.stored,
    publish,
  } as unknown as RefreshModelsContext;
}

function authCtx(env: Record<string, string | undefined> = {}) {
  return {
    env: async (name: string) => env[name],
    fileExists: async () => false,
  };
}

describe("createSyntheticProvider", () => {
  it("registers full pi-ai models stamped with api/provider/baseUrl/headers", () => {
    const { provider } = createProvider();
    expect(provider.id).toBe(SYNTHETIC_PROVIDER_ID);
    expect(provider.baseUrl).toBe(SYNTHETIC_BASE_URL);
    for (const model of provider.getModels()) {
      expect(model.api).toBe("openai-completions");
      expect(model.provider).toBe(SYNTHETIC_PROVIDER_ID);
      expect(model.baseUrl).toBe(SYNTHETIC_BASE_URL);
      expect(model.headers).toEqual({
        Referer: "https://pi.dev",
        "X-Title": "npm:@aliou/pi-synthetic",
      });
    }
  });
});

describe("auth.apiKey.resolve", () => {
  it("prefers the stored credential", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx({ [SYNTHETIC_API_KEY_ENV]: "env-key" }),
      credential: { type: "api_key", key: "stored-key" },
      signal: new AbortController().signal,
    });
    expect(result?.auth.apiKey).toBe("stored-key");
    expect(result?.source).toBe("stored credential");
  });

  it("falls back to the SYNTHETIC_API_KEY environment variable", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx({ [SYNTHETIC_API_KEY_ENV]: "env-key" }),
      signal: new AbortController().signal,
    });
    expect(result?.auth.apiKey).toBe("env-key");
    expect(result?.source).toBe(SYNTHETIC_API_KEY_ENV);
  });

  it("never fails: resolves anonymously so public catalog refresh works without credentials", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx(),
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ auth: { apiKey: "" }, source: "anonymous" });
  });

  it("honors the abort signal", async () => {
    const { provider } = createProvider();
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.auth.apiKey?.resolve({
        ctx: authCtx(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("auth.apiKey.check", () => {
  it("reports unconfigured without a key so models stay hidden from /model", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.check?.({
      ctx: authCtx(),
      signal: new AbortController().signal,
    });
    expect(result).toBeUndefined();
  });

  it("reports configured with an env key or stored credential", async () => {
    const { provider } = createProvider();
    await expect(
      provider.auth.apiKey?.check?.({
        ctx: authCtx({ [SYNTHETIC_API_KEY_ENV]: "env-key" }),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ source: SYNTHETIC_API_KEY_ENV });
    await expect(
      provider.auth.apiKey?.check?.({
        ctx: authCtx(),
        credential: { type: "api_key", key: "stored-key" },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ source: "stored credential" });
  });
});

describe("auth.apiKey.login", () => {
  it("prompts for the key", async () => {
    const { provider } = createProvider();
    const prompt = vi.fn(async () => "entered-key");
    const credential = await provider.auth.apiKey?.login?.({
      prompt,
      signal: new AbortController().signal,
    } as unknown as ProviderAuthInteraction);
    expect(prompt).toHaveBeenCalledWith({
      type: "secret",
      message: "Enter Synthetic API key",
    });
    expect(credential).toEqual({ type: "api_key", key: "entered-key" });
  });
});

describe("refreshModels", () => {
  it("forwards the anonymous credential to the catalog fetch and publishes refreshed models", async () => {
    const { provider, fetchApiModels } = createProvider();

    await provider.refreshModels?.(
      createContext({
        credential: { type: "api_key", key: "" },
      }),
    );

    expect(fetchApiModels).toHaveBeenCalledWith("", expect.anything());
    const ids = provider.getModels().map((model) => model.id);
    expect(ids).toContain("syn:fetched");
    expect(provider.getModels()[0]?.provider).toBe(SYNTHETIC_PROVIDER_ID);
  });

  it("keeps the static catalog when the fetch fails", async () => {
    const { provider } = createProvider({
      fetchApiModels: async () => {
        throw new Error("network down");
      },
    });

    await provider.refreshModels?.(
      createContext({ credential: { type: "api_key", key: "" } }),
    );

    expect(provider.getModels().map((model) => model.id)).toEqual([
      "syn:static",
    ]);
  });

  it("adopts a fresh stored catalog without fetching", async () => {
    const { provider, fetchApiModels } = createProvider();

    await provider.refreshModels?.(
      createContext({
        allowNetwork: true,
        stored: {
          models: [{ id: "syn:stored", name: "syn:stored" }],
          checkedAt: Date.now(),
        } as unknown as ModelsStoreEntry,
      }),
    );

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(provider.getModels().map((model) => model.id)).toEqual([
      "syn:stored",
    ]);
  });

  it("restores a fresh stored catalog in offline phases without fetching", async () => {
    const { provider, fetchApiModels } = createProvider();

    await provider.refreshModels?.(
      createContext({
        allowNetwork: false,
        stored: {
          models: [{ id: "syn:stored", name: "syn:stored" }],
          checkedAt: Date.now(),
        } as unknown as ModelsStoreEntry,
      }),
    );

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(provider.getModels().map((model) => model.id)).toEqual([
      "syn:stored",
    ]);
  });

  it("aborts without swapping the catalog when the refresh signal aborts mid-flight", async () => {
    const controller = new AbortController();
    const { provider } = createProvider({
      fetchApiModels: async () => {
        controller.abort();
        return [fetchedModel];
      },
    });

    // The inner refresh rethrows the abort after fetching; pi swallows
    // aborted refreshes. The catalog must remain the static one.
    await expect(
      provider.refreshModels?.(
        createContext({
          credential: { type: "api_key", key: "" },
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow();

    expect(provider.getModels().map((model) => model.id)).toEqual([
      "syn:static",
    ]);
  });
});
