import type {
  AssistantMessage,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  createAssistantMessageEventStream,
  normalizeContext,
} from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { SYNTHETIC_PROVIDER_ID } from "../constants";
import { createOpenAiCompletionsApi } from "./openai-completions";
import type { AnyStreamSimple } from "./types";

const model: Model<"openai-completions"> = {
  id: "hf:deepseek-ai/DeepSeek-V4.1-Flash",
  name: "DeepSeek Flash",
  provider: SYNTHETIC_PROVIDER_ID,
  api: "openai-completions",
  baseUrl: "https://custom.example/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 524288,
  maxTokens: 2048,
  compat: { supportsDeveloperRole: false, maxTokensField: "max_tokens" },
};

function assistant(
  content: AssistantMessage["content"] = [
    {
      type: "thinking",
      thinking: "Remember the earlier plan.",
      thinkingSignature: "reasoning",
    },
    { type: "text", text: "Noted." },
  ],
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content,
    stopReason: "stop",
    timestamp: 1,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    ...overrides,
  };
}

function transcript(
  message = assistant(),
  withTools = false,
): TranscriptContext {
  return normalizeContext({
    systemPrompt: "Follow instructions.",
    messages: [
      { role: "user", content: "Make a plan.", timestamp: 0 },
      message,
      { role: "user", content: "Continue.", timestamp: 2 },
    ],
    tools: withTools
      ? [
          {
            name: "bash",
            description: "Run a command.",
            parameters: Type.Object({ command: Type.String() }),
          },
        ]
      : undefined,
  });
}

interface Payload {
  messages: Record<string, unknown>[];
  [key: string]: unknown;
}

function transport() {
  const payloads: Payload[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const payload = await request.json();
    payloads.push(payload as Payload);
    const chunk = {
      id: "test-response",
      object: "chat.completion.chunk",
      created: 0,
      model: model.id,
      choices: [{ index: 0, delta: { content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
    };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  });
  return { fetch, payloads };
}

describe.each(["stream", "streamSimple"] as const)("%s replay", (entry) => {
  it.each([
    {
      id: "hf:deepseek-ai/DeepSeek-V4.1-Flash-1017",
      field: "reasoning_content",
    },
    { id: "hf:zai-org/GLM-4.7-Flash", field: "reasoning" },
    { id: "hf:openai/gpt-oss-120b", field: "reasoning" },
    { id: "hf:deepseek-ai/untested-model", field: "reasoning" },
    { id: "syn:large:text", field: "reasoning" },
  ])("uses $field for $id", async ({ id, field }) => {
    const target: Model<"openai-completions"> = { ...model, id };
    const context = transcript(assistant(undefined, { model: id }));
    const before = structuredClone(context);
    const { fetch, payloads } = transport();
    const result = await createOpenAiCompletionsApi()
      [entry](target, context, { apiKey: "test-key", fetch })
      .result();

    expect(result.stopReason).toBe("stop");
    expect(payloads[0].messages.find((m) => m.role === "assistant")).toEqual({
      role: "assistant",
      content: "Noted.",
      [field]: "Remember the earlier plan.",
    });
    expect(context).toEqual(before);
  });

  it.each([
    { provider: "other-provider" },
    { api: "anthropic-messages" },
    { model: "other-model" },
  ])("keeps Pi's cross-model conversion for %j", async (overrides) => {
    const context = transcript(assistant(undefined, overrides));
    const before = structuredClone(context);
    const { fetch, payloads } = transport();
    const result = await createOpenAiCompletionsApi()
      [entry](model, context, { apiKey: "test-key", fetch })
      .result();
    const replay = payloads[0].messages.find((m) => m.role === "assistant");

    expect(result.stopReason).toBe("stop");
    expect(replay?.content).toContain("Remember the earlier plan.");
    expect(replay?.content).toContain("Noted.");
    expect(replay).not.toHaveProperty("reasoning");
    expect(replay).not.toHaveProperty("reasoning_content");
    expect(context).toEqual(before);
  });

  it.each([
    false,
    true,
  ])("replays thinking with tools=%s", async (withTools) => {
    const context = transcript(assistant(), withTools);
    const before = structuredClone(context);
    const { fetch, payloads } = transport();
    const result = await createOpenAiCompletionsApi()
      [entry](model, context, { apiKey: "test-key", fetch })
      .result();

    expect(result.stopReason).toBe("stop");
    expect(fetch).toHaveBeenCalledOnce();
    expect(payloads[0].messages.find((m) => m.role === "assistant")).toEqual({
      role: "assistant",
      content: "Noted.",
      reasoning_content: "Remember the earlier plan.",
    });
    expect(context).toEqual(before);
  });

  it("preserves async payload replacements after normalizing replay", async () => {
    const { fetch, payloads } = transport();
    const onPayload = vi.fn<NonNullable<SimpleStreamOptions["onPayload"]>>(
      async (payload) => {
        const body = payload as Payload;
        expect(
          body.messages.find((m) => m.role === "assistant"),
        ).toHaveProperty("reasoning_content", "Remember the earlier plan.");
        return { ...body, temperature: 0.25 };
      },
    );
    const result = await createOpenAiCompletionsApi()
      [entry](model, transcript(), { apiKey: "test-key", fetch, onPayload })
      .result();

    expect(result.stopReason).toBe("stop");
    expect(onPayload).toHaveBeenCalledOnce();
    expect(payloads[0].temperature).toBe(0.25);
  });

  it("preserves in-place payload changes when the caller returns undefined", async () => {
    const { fetch, payloads } = transport();
    const result = await createOpenAiCompletionsApi()
      [entry](model, transcript(), {
        apiKey: "test-key",
        fetch,
        onPayload: (payload) => {
          (payload as Payload).temperature = 0.5;
        },
      })
      .result();

    expect(result.stopReason).toBe("stop");
    expect(payloads[0].temperature).toBe(0.5);
  });

  it("preserves assistant text, tool calls, and tool results", async () => {
    const context = transcript(
      assistant([
        {
          type: "thinking",
          thinking: "Run the check.",
          thinkingSignature: "reasoning",
        },
        { type: "text", text: "Checking." },
        {
          type: "toolCall",
          id: "call_check",
          name: "bash",
          arguments: { command: "echo ok" },
        },
      ]),
      true,
    );
    context.messages.splice(3, 0, {
      role: "toolResult",
      toolCallId: "call_check",
      toolName: "bash",
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp: 2,
    });
    const before = structuredClone(context);
    const { fetch, payloads } = transport();
    const result = await createOpenAiCompletionsApi()
      [entry](model, context, { apiKey: "test-key", fetch })
      .result();

    expect(result.stopReason).toBe("stop");
    expect(
      payloads[0].messages.find((m) => m.role === "assistant"),
    ).toMatchObject({
      content: "Checking.",
      reasoning_content: "Run the check.",
      tool_calls: [
        {
          id: "call_check",
          type: "function",
          function: { name: "bash", arguments: '{"command":"echo ok"}' },
        },
      ],
    });
    expect(payloads[0].messages.find((m) => m.role === "tool")).toMatchObject({
      tool_call_id: "call_check",
      content: "ok",
    });
    expect(context).toEqual(before);
  });
});

describe("delegation", () => {
  it.each([
    "reasoning_content",
    "reasoning_text",
    '[{"type":"reasoning.encrypted","data":"opaque"}]',
  ])("leaves the %s signature untouched", (thinkingSignature) => {
    const block = {
      type: "thinking" as const,
      thinking: "Plan.",
      thinkingSignature,
    };
    const context = transcript(assistant([block]));
    const delegate = vi.fn<AnyStreamSimple>(() =>
      createAssistantMessageEventStream(),
    );
    const options = { onPayload: vi.fn(), headers: { "X-Test": "value" } };
    createOpenAiCompletionsApi({ streamSimple: delegate }).streamSimple(
      model,
      context,
      options,
    );

    const forwarded = delegate.mock.calls[0][1].messages[2] as AssistantMessage;
    expect(forwarded.content[0]).toBe(block);
    expect(delegate.mock.calls[0][2]).toBe(options);
  });

  it("does not rewrite redacted thinking", () => {
    const block = {
      type: "thinking" as const,
      thinking: "",
      thinkingSignature: "reasoning",
      redacted: true,
    };
    const context = transcript(assistant([block]));
    const delegate = vi.fn<AnyStreamSimple>(() =>
      createAssistantMessageEventStream(),
    );
    createOpenAiCompletionsApi({ streamSimple: delegate }).streamSimple(
      model,
      context,
    );

    const forwarded = delegate.mock.calls[0][1].messages[2] as AssistantMessage;
    expect(forwarded.content[0]).toBe(block);
  });
});
