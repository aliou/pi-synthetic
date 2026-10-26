import type {
  AssistantMessage,
  Model,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import {
  SYNTHETIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
} from "../constants";
import type { SyntheticModel } from "../models";
import type { AnyStreamSimple, SyntheticApiHandler } from "./types";

export { SYNTHETIC_BASE_URL };

const REASONING_REPLAY_MODELS = new Set([
  "hf:deepseek-ai/DeepSeek-V4.1-Flash",
  "hf:deepseek-ai/DeepSeek-V4.1-Flash-1017",
]);

export function toOpenAiCompletionsModels(
  models: SyntheticModel[],
): Model<"openai-completions">[] {
  return models.map((model) => ({
    ...model,
    api: "openai-completions",
    provider: SYNTHETIC_PROVIDER_ID,
    baseUrl: SYNTHETIC_BASE_URL,
    headers: SYNTHETIC_REQUEST_HEADERS,
  }));
}

function normalizeThinkingSignature(
  block: AssistantMessage["content"][number],
): AssistantMessage["content"][number] {
  if (block.type !== "thinking") return block;
  if (block.redacted) return block;
  if (block.thinkingSignature !== "reasoning") return block;
  return { ...block, thinkingSignature: "reasoning_content" };
}

function normalizeReasoningReplay(
  modelId: string,
  context: TranscriptContext,
): TranscriptContext {
  if (!REASONING_REPLAY_MODELS.has(modelId)) return context;
  return {
    ...context,
    messages: context.messages.map((message) => {
      if (message.role !== "assistant") return message;
      return {
        ...message,
        content: message.content.map(normalizeThinkingSignature),
      };
    }),
  };
}

export function createOpenAiCompletionsApi(options?: {
  streamSimple?: AnyStreamSimple;
}): SyntheticApiHandler {
  return {
    stampModels: toOpenAiCompletionsModels,
    stream: (model, context, streamOptions) =>
      stream(
        model,
        normalizeReasoningReplay(model.id, context),
        streamOptions as never,
      ),
    streamSimple: (model, context, simpleOptions) =>
      (options?.streamSimple ?? streamSimple)(
        model,
        normalizeReasoningReplay(model.id, context),
        simpleOptions,
      ),
  };
}
