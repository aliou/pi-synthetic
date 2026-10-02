// Rewrites outgoing openai-completions payloads for models whose served chat
// template renders replayed thinking under a different wire field than the
// model streamed it, or behind a chat_template_kwargs render flag. Driven by
// the per-model `reasoningReplay` catalog knob.

import type { Api, Model, StreamOptions } from "@earendil-works/pi-ai";
import type { ReasoningReplay } from "../models";

/** Sibling wire field names for replayed assistant thinking. */
const REPLAY_FIELD_SIBLINGS = {
  reasoning: "reasoning_content",
  reasoning_content: "reasoning",
} as const;

type StampedSyntheticModel = Model<Api> & {
  reasoningReplay?: ReasoningReplay;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof (value as PromiseLike<unknown> | undefined)?.then === "function"
  );
}

/** Move (not copy) an assistant message's replayed thinking to the rendered
 * field: a pre-set non-empty target wins, an empty target is replaced. */
function moveReplayedThinking(
  message: Record<string, unknown>,
  target: "reasoning" | "reasoning_content",
): Record<string, unknown> {
  const source = REPLAY_FIELD_SIBLINGS[target];
  const sourceValue = message[source];
  // Nothing recorded to move.
  if (typeof sourceValue !== "string" || sourceValue === "") return message;
  const targetValue = message[target];
  // A pre-set non-empty target wins; drop the duplicate source.
  if (targetValue !== undefined && targetValue !== "") {
    if (!(source in message)) return message;
    const { [source]: _dropped, ...rest } = message;
    return rest;
  }
  // Absent target is set; an empty one is replaced.
  const { [source]: _dropped, ...rest } = message;
  return { ...rest, [target]: sourceValue };
}

/**
 * Apply a `reasoningReplay` knob to an outgoing payload: rename each
 * assistant message's replayed thinking to `knob.field` and merge
 * `knob.templateKwargs` into `chat_template_kwargs` (knob values win).
 * Pure; returns the same reference when nothing changes.
 */
export function rewriteReasoningReplayPayload(
  payload: unknown,
  knob: ReasoningReplay,
): unknown {
  if (payload === null || typeof payload !== "object") return payload;
  const record = payload as Record<string, unknown>;
  let result: Record<string, unknown> = record;

  const field = knob.field;
  if (field !== undefined && Array.isArray(result.messages)) {
    let rewritten = false;
    const messages = result.messages.map((message) => {
      if (!isPlainRecord(message) || message.role !== "assistant") {
        return message;
      }
      const moved = moveReplayedThinking(message, field);
      rewritten = rewritten || moved !== message;
      return moved;
    });
    if (rewritten) result = { ...result, messages };
  }

  if (knob.templateKwargs !== undefined) {
    const existing = result.chat_template_kwargs;
    result = {
      ...result,
      chat_template_kwargs: {
        ...(isPlainRecord(existing) ? existing : {}),
        ...knob.templateKwargs,
      },
    };
  }

  return result;
}

/**
 * Wrap request options so knob models get the payload fixup via a chained
 * `onPayload` (the caller's hook runs first, and its replacement is
 * rewritten). Models without a knob return the options untouched.
 */
export function withReasoningReplay(
  model: Model<Api>,
  options: StreamOptions | undefined,
): StreamOptions | undefined {
  const knob = (model as StampedSyntheticModel).reasoningReplay;
  if (!knob) return options;
  const caller = options?.onPayload;
  return {
    ...(options ?? {}),
    onPayload: (payload: unknown, hookModel: Model<Api>) => {
      const rewrite = (candidate: unknown): unknown =>
        rewriteReasoningReplayPayload(candidate ?? payload, knob);
      const replaced = caller?.(payload, hookModel) ?? payload;
      return isPromiseLike(replaced)
        ? Promise.resolve(replaced).then(rewrite)
        : rewrite(replaced);
    },
  };
}
