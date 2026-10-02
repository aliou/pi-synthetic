import type {
  Model,
  SimpleStreamOptions,
  StreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { ReasoningReplay } from "../models";
import {
  createOpenAiCompletionsApi,
  toOpenAiCompletionsModels,
} from "./openai-completions";
import {
  rewriteReasoningReplayPayload,
  withReasoningReplay,
} from "./reasoning-replay";
import type { AnyStreamSimple } from "./types";

const DEEPSEEK_KNOB: ReasoningReplay = { field: "reasoning_content" };
const GLM_KNOB: ReasoningReplay = {
  field: "reasoning_content",
  templateKwargs: { clear_thinking: false },
};

/** DeepSeek streams `reasoning`; the served template renders only
 * `reasoning_content`. */
const deepSeekPayload = {
  model: "hf:deepseek-ai/DeepSeek-V4.1-Flash",
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "turn one" },
    {
      role: "assistant",
      content: "turn one answer",
      reasoning: "I should check the docs first",
    },
    { role: "user", content: "turn two" },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "lookup",
        parameters: { type: "object", properties: {} },
        strict: true,
      },
    },
  ],
};

function knobModel(knob?: ReasoningReplay): Model<"openai-completions"> {
  return {
    id: "hf:model",
    reasoningReplay: knob,
  } as unknown as Model<"openai-completions">;
}

const replayedPayload = {
  messages: [{ role: "assistant", content: "answer", reasoning: "recorded" }],
};

describe("rewriteReasoningReplayPayload", () => {
  it("moves replayed reasoning to the rendered field (DeepSeek rename)", () => {
    const rewritten = rewriteReasoningReplayPayload(
      deepSeekPayload,
      DEEPSEEK_KNOB,
    ) as Record<string, unknown>;

    const messages = rewritten.messages as Array<
      Record<string, unknown & unknown>
    >;
    expect(messages[2]).toEqual({
      role: "assistant",
      content: "turn one answer",
      reasoning_content: "I should check the docs first",
    });
    // Move, not copy.
    expect(messages[2].reasoning).toBeUndefined();
    expect("reasoning" in messages[2]).toBe(false);
    // Untouched neighbors.
    expect(messages[0]).toEqual(deepSeekPayload.messages[0]);
    expect(messages[3]).toEqual(deepSeekPayload.messages[3]);
    // Pure: original payload is not mutated.
    expect(deepSeekPayload.messages[2]).toEqual({
      role: "assistant",
      content: "turn one answer",
      reasoning: "I should check the docs first",
    });
  });

  it("keeps a pre-set non-empty rendered field and drops the duplicate", () => {
    const payload = {
      messages: [
        {
          role: "assistant",
          content: "answer",
          reasoning: "recorded",
          reasoning_content: "already rendered",
        },
      ],
    };
    const rewritten = rewriteReasoningReplayPayload(payload, DEEPSEEK_KNOB) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(rewritten.messages[0]).toEqual({
      role: "assistant",
      content: "answer",
      reasoning_content: "already rendered",
    });
  });

  it("replaces an empty rendered field", () => {
    const payload = {
      messages: [
        {
          role: "assistant",
          content: "answer",
          reasoning: "recorded",
          reasoning_content: "",
        },
      ],
    };
    const rewritten = rewriteReasoningReplayPayload(payload, DEEPSEEK_KNOB) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(rewritten.messages[0]).toEqual({
      role: "assistant",
      content: "answer",
      reasoning_content: "recorded",
    });
  });

  it("is a no-op when the recorded field already matches the rendered one", () => {
    // Nothing recorded under `reasoning`, so a kwargs-free knob is a pure
    // no-op; the GLM knob only merges kwargs.
    const payload = {
      messages: [
        {
          role: "assistant",
          content: "answer",
          reasoning_content: "already rendered",
        },
      ],
    };
    const rewritten = rewriteReasoningReplayPayload(payload, {
      field: "reasoning_content",
    });
    expect(rewritten).toBe(payload);

    // With the full GLM knob only kwargs are merged.
    const glmRewritten = rewriteReasoningReplayPayload(payload, GLM_KNOB) as {
      messages: unknown[];
      chat_template_kwargs: Record<string, unknown>;
    };
    expect(glmRewritten.messages).toEqual(payload.messages);
    expect(glmRewritten.chat_template_kwargs).toEqual({
      clear_thinking: false,
    });
  });

  it("returns the payload by reference when nothing needs rewriting", () => {
    const payload = {
      messages: [{ role: "user", content: "hello" }],
    };
    expect(rewriteReasoningReplayPayload(payload, DEEPSEEK_KNOB)).toBe(payload);
    // Non-records pass through: reasoning on tool messages, non-string
    // reasoning, any non-object payload.
    expect(
      rewriteReasoningReplayPayload(
        {
          messages: [
            { role: "assistant", content: "a", reasoning: 123 },
            { role: "tool", content: "t", reasoning: "not assistant" },
          ],
        },
        DEEPSEEK_KNOB,
      ),
    ).toEqual({
      messages: [
        { role: "assistant", content: "a", reasoning: 123 },
        { role: "tool", content: "t", reasoning: "not assistant" },
      ],
    });
    expect(rewriteReasoningReplayPayload("body", DEEPSEEK_KNOB)).toBe("body");
    expect(rewriteReasoningReplayPayload(null, DEEPSEEK_KNOB)).toBeNull();
  });

  it("merges template kwargs and lets the knob win (GLM)", () => {
    const payload = {
      messages: [{ role: "user", content: "hello" }],
      chat_template_kwargs: { other: "keep", clear_thinking: true },
    };
    const rewritten = rewriteReasoningReplayPayload(payload, GLM_KNOB) as {
      chat_template_kwargs: Record<string, unknown>;
    };
    expect(rewritten.chat_template_kwargs).toEqual({
      other: "keep",
      clear_thinking: false,
    });
    // The original kwargs object is not mutated.
    expect(payload.chat_template_kwargs).toEqual({
      other: "keep",
      clear_thinking: true,
    });
  });

  it("creates chat_template_kwargs when absent and renames in the same pass", () => {
    const payload = {
      messages: [
        { role: "assistant", content: "answer", reasoning: "recorded" },
      ],
    };
    const rewritten = rewriteReasoningReplayPayload(payload, GLM_KNOB) as {
      messages: Array<Record<string, unknown>>;
      chat_template_kwargs: Record<string, unknown>;
    };
    expect(rewritten.chat_template_kwargs).toEqual({ clear_thinking: false });
    expect(rewritten.messages[0]).toEqual({
      role: "assistant",
      content: "answer",
      reasoning_content: "recorded",
    });
  });

  it("merges kwargs without a field knob and supports kwargs-only knobs", () => {
    const payload = {
      messages: [
        { role: "assistant", content: "answer", reasoning: "recorded" },
      ],
    };
    const rewritten = rewriteReasoningReplayPayload(payload, {
      templateKwargs: { clear_thinking: false },
    }) as Record<string, unknown>;
    expect(rewritten.chat_template_kwargs).toEqual({ clear_thinking: false });
    // No field knob: messages untouched (same reference).
    expect(rewritten.messages).toBe(payload.messages);
  });

  it("passes strict tool schemas through untouched", () => {
    const rewritten = rewriteReasoningReplayPayload(
      deepSeekPayload,
      DEEPSEEK_KNOB,
    ) as { tools: unknown[] };
    expect(rewritten.tools).toEqual(deepSeekPayload.tools);
  });
});

describe("withReasoningReplay", () => {
  const payload = replayedPayload;

  it("returns caller options untouched for models without a knob", () => {
    const options = { apiKey: "k", onPayload: vi.fn() } as StreamOptions;
    expect(withReasoningReplay(knobModel(), options)).toBe(options);
    expect(withReasoningReplay(knobModel(), undefined)).toBeUndefined();
  });

  it("chains the caller's onPayload first, then rewrites its replacement", () => {
    const caller = vi.fn(() => ({
      ...payload,
      messages: payload.messages,
      marker: "caller",
    }));
    const options = withReasoningReplay(knobModel(DEEPSEEK_KNOB), {
      onPayload: caller,
    });

    const result = options?.onPayload?.(payload, knobModel()) as Record<
      string,
      unknown
    >;
    expect(caller).toHaveBeenCalledOnce();
    expect(result.marker).toBe("caller");
    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0].reasoning_content).toBe("recorded");
    expect("reasoning" in messages[0]).toBe(false);
  });

  it("rewrites the original payload when the caller returns undefined", () => {
    const caller = vi.fn(() => undefined);
    const options = withReasoningReplay(knobModel(DEEPSEEK_KNOB), {
      onPayload: caller,
    });

    const result = options?.onPayload?.(payload, knobModel()) as Record<
      string,
      unknown
    >;
    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0].reasoning_content).toBe("recorded");
    expect("reasoning" in messages[0]).toBe(false);
  });

  it("awaits an async caller before rewriting", async () => {
    const caller = vi.fn(async () => structuredClone(payload));
    const options = withReasoningReplay(knobModel(DEEPSEEK_KNOB), {
      onPayload: caller,
    });
    const rewrittenPayload = await options?.onPayload?.(payload, knobModel());
    const result = rewrittenPayload as Record<string, unknown>;
    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0].reasoning_content).toBe("recorded");
    expect("reasoning" in messages[0]).toBe(false);
  });

  it("installs a rewriting hook even without caller options", () => {
    const options = withReasoningReplay(knobModel(DEEPSEEK_KNOB), undefined);
    expect(options).toBeDefined();
    const result = options?.onPayload?.(payload, knobModel()) as Record<
      string,
      unknown
    >;
    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0].reasoning_content).toBe("recorded");
  });

  it("preserves the other caller options when wrapping", () => {
    const options = withReasoningReplay(knobModel(DEEPSEEK_KNOB), {
      apiKey: "k",
      maxRetries: 3,
    });
    expect(options?.apiKey).toBe("k");
    expect(options?.maxRetries).toBe(3);
    expect(options?.onPayload).toBeTypeOf("function");
  });
});

describe("openai-completions api wiring", () => {
  const payload = replayedPayload;

  it("streamSimple rewrites knob models before the delegate sees them", () => {
    const delegate = vi.fn<AnyStreamSimple>(() =>
      createAssistantMessageEventStream(),
    );
    const api = createOpenAiCompletionsApi({ streamSimple: delegate });
    const caller = vi.fn(() => undefined);

    api.streamSimple(
      knobModel(DEEPSEEK_KNOB),
      { messages: [] } as never,
      {
        apiKey: "k",
        onPayload: caller,
      } as SimpleStreamOptions,
    );

    expect(delegate).toHaveBeenCalledOnce();
    const delegateOptions = delegate.mock.calls[0]?.[2] as
      | {
          onPayload?: (
            payload: unknown,
            model: Model<"openai-completions">,
          ) => unknown;
        }
      | undefined;
    expect(delegateOptions?.onPayload).toBeTypeOf("function");
    expect(delegateOptions?.onPayload).not.toBe(caller);

    const result = delegateOptions?.onPayload?.(payload, knobModel()) as Record<
      string,
      unknown
    >;
    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0].reasoning_content).toBe("recorded");
    expect("reasoning" in messages[0]).toBe(false);
  });

  it("streamSimple passes kwargs-only knobs (GLM) through the wiring", () => {
    const delegate = vi.fn<AnyStreamSimple>(() =>
      createAssistantMessageEventStream(),
    );
    const api = createOpenAiCompletionsApi({ streamSimple: delegate });

    api.streamSimple(
      knobModel(GLM_KNOB),
      { messages: [] } as never,
      {
        apiKey: "k",
      } as SimpleStreamOptions,
    );

    const delegateOptions = delegate.mock.calls[0]?.[2] as
      | {
          onPayload?: (
            payload: unknown,
            model: Model<"openai-completions">,
          ) => unknown;
        }
      | undefined;
    const result = delegateOptions?.onPayload?.(
      { chat_template_kwargs: { clear_thinking: true } },
      knobModel(),
    ) as { chat_template_kwargs: Record<string, unknown> };
    expect(result.chat_template_kwargs).toEqual({ clear_thinking: false });
  });

  it("streamSimple passes knob-less options through by reference", () => {
    const delegate = vi.fn<AnyStreamSimple>(() =>
      createAssistantMessageEventStream(),
    );
    const api = createOpenAiCompletionsApi({ streamSimple: delegate });
    const options = { apiKey: "k" } as SimpleStreamOptions;

    api.streamSimple(knobModel(), { messages: [] } as never, options);

    expect(delegate).toHaveBeenCalledOnce();
    expect(delegate.mock.calls[0]?.[2]).toBe(options);
  });

  it("stampModels carries the knob onto the stamped model the injector reads", () => {
    const stamped = toOpenAiCompletionsModels([
      {
        id: "hf:knobbed/model",
        reasoningReplay: { field: "reasoning_content" },
      } as unknown as Parameters<typeof toOpenAiCompletionsModels>[0][number],
    ]);
    expect(stamped).toHaveLength(1);
    const knob = (
      stamped[0] as Model<"openai-completions"> & {
        reasoningReplay?: ReasoningReplay;
      }
    ).reasoningReplay;
    expect(knob).toEqual({ field: "reasoning_content" });
  });
});
