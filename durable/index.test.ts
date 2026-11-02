import { tmpdir } from "node:os";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  ToolResultEntry,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { describe, expect, it, vi } from "vitest";
import {
  createSyntheticExtension,
  default as createSyntheticExtensionDefault,
  SYNTHETIC_EXTENSION_NAME,
} from "./index";

function stubSearchResponse(results: unknown[]) {
  return vi.fn(
    async () => new Response(JSON.stringify({ results }), { status: 200 }),
  );
}

async function readToolResults(storage: MemoryStorage, conversationId: string) {
  const page = await storage.scanEntries(
    { conversationId },
    100,
    undefined,
    BACKGROUND_CONTEXT,
  );
  return page.items.filter(ToolResultEntry.is);
}

function resultText(
  entry: ReturnType<typeof ToolResultEntry.is> extends (
    value: never,
  ) => value is infer T
    ? T | undefined
    : never,
): string {
  const message = entry?.model?.find(
    (m): m is ToolResultMessage => m.role === "toolResult",
  );
  if (!message) return "";
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function openHarness(options?: { env?: boolean }) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("synthetic_web_search", { query: "pi durable tools" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);

  const registry = createRegistry();
  registry.install(createSyntheticExtension({ apiKey: "test-key" }));

  const storage = new MemoryStorage();
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      env: options?.env
        ? () => new NodeExecutionEnv({ cwd: tmpdir() })
        : undefined,
    },
    BACKGROUND_CONTEXT,
  );
  const root = await harness.root(BACKGROUND_CONTEXT, {
    agent: { model: { provider: "faux", modelId: "faux-1" } },
  });
  return { faux, storage, harness, root };
}

describe("createSyntheticExtension", () => {
  it("names the extension stably after the npm package", () => {
    expect(SYNTHETIC_EXTENSION_NAME).toBe("@aliou/pi-synthetic");
    expect(createSyntheticExtensionDefault().name).toBe("@aliou/pi-synthetic");
  });

  it("runs the web search tool inside a conversation", async () => {
    const fetchMock = stubSearchResponse([
      {
        title: "pi durable",
        url: "https://example.com/pi-durable",
        text: "Durable extensions for pi.",
        published: "2026-02-01",
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { storage, harness, root } = await openHarness();
    try {
      const submission = await root.submit(
        { type: "input", content: "search the web" },
        BACKGROUND_CONTEXT,
      );
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      expect(settled.status).toBe("done");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchMock.mock.calls[0] as [string];
      expect(calledUrl).toContain("/v2/search");

      const toolResults = await readToolResults(storage, root.id);
      expect(toolResults).toHaveLength(1);
      const text = resultText(toolResults[0]);
      expect(text).toContain("Found 1 result(s)");
      expect(text).toContain("pi durable");
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
      vi.unstubAllGlobals();
    }
  });

  it("saves truncated results through the host environment", async () => {
    vi.stubGlobal(
      "fetch",
      stubSearchResponse([
        {
          title: "large result",
          url: "https://example.com/large",
          text: "large body\n".repeat(1000),
          published: "2026-02-01",
        },
      ]),
    );

    const { storage, harness, root } = await openHarness({ env: true });
    try {
      const submission = await root.submit(
        { type: "input", content: "search the web" },
        BACKGROUND_CONTEXT,
      );
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      expect(settled.status).toBe("done");

      const toolResults = await readToolResults(storage, root.id);
      const text = resultText(toolResults[0]);
      const match = text.match(/Full result saved to: (.+?\.md)\./);
      const savedPath = match?.[1];
      expect(savedPath).toBeTruthy();

      const env = new NodeExecutionEnv({ cwd: tmpdir() });
      const saved = savedPath
        ? await env.readTextFile(savedPath, BACKGROUND_CONTEXT)
        : undefined;
      expect(saved?.ok).toBe(true);
      if (saved?.ok) {
        expect(saved.value).toBe("large body\n".repeat(1000));
      }
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
      vi.unstubAllGlobals();
    }
  });

  it("truncates without temp files when the host has no environment", async () => {
    vi.stubGlobal(
      "fetch",
      stubSearchResponse([
        {
          title: "large result",
          url: "https://example.com/large",
          text: "large body\n".repeat(1000),
          published: "2026-02-01",
        },
      ]),
    );

    const { storage, harness, root } = await openHarness();
    try {
      const submission = await root.submit(
        { type: "input", content: "search the web" },
        BACKGROUND_CONTEXT,
      );
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      expect(settled.status).toBe("done");

      const toolResults = await readToolResults(storage, root.id);
      const text = resultText(toolResults[0]);
      expect(text).toContain("Content truncated to");
      expect(text).not.toContain("Full result saved to:");
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
      vi.unstubAllGlobals();
    }
  });

  it("fails with guidance when no credentials resolve", async () => {
    const fetchMock = stubSearchResponse([]);
    vi.stubGlobal("fetch", fetchMock);

    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("synthetic_web_search", { query: "pi durable tools" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);

    const registry = createRegistry();
    registry.install(createSyntheticExtension());

    const storage = new MemoryStorage();
    const harness = await Harness.open(
      storage,
      { models, registry },
      BACKGROUND_CONTEXT,
    );
    try {
      const root = await harness.root(BACKGROUND_CONTEXT, {
        agent: { model: { provider: "faux", modelId: "faux-1" } },
      });
      const submission = await root.submit(
        { type: "input", content: "search the web" },
        BACKGROUND_CONTEXT,
      );
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      expect(settled.status).toBe("done");

      const toolResults = await readToolResults(storage, root.id);
      expect(toolResults).toHaveLength(1);
      const message = toolResults[0]?.model?.find(
        (m) => m.role === "toolResult",
      );
      expect(message && message.role === "toolResult" && message.isError).toBe(
        true,
      );
      const text = resultText(toolResults[0]);
      expect(text).toContain("requires a Synthetic subscription");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
      vi.unstubAllGlobals();
    }
  });
});
