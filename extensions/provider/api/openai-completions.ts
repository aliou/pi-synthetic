import type {
  Api,
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
import type { ReasoningReplayField, SyntheticModel } from "../models";
import type { AnyStreamSimple, SyntheticApiHandler } from "./types";

export { SYNTHETIC_BASE_URL };

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
  field: ReasoningReplayField,
): AssistantMessage["content"][number] {
  if (block.type !== "thinking") return block;
  if (block.redacted) return block;
  if (block.thinkingSignature !== "reasoning") return block;
  return { ...block, thinkingSignature: field };
}

function normalizeReasoningReplay(
  model: Model<Api>,
  context: TranscriptContext,
): TranscriptContext {
  const { reasoningReplayField } = model as Partial<SyntheticModel>;
  if (!reasoningReplayField) return context;
  return {
    ...context,
    messages: context.messages.map((message) => {
      if (message.role !== "assistant") return message;
      return {
        ...message,
        content: message.content.map((block) =>
          normalizeThinkingSignature(block, reasoningReplayField),
        ),
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
        normalizeReasoningReplay(model, context),
        streamOptions as never,
      ),
    streamSimple: (model, context, simpleOptions) =>
      (options?.streamSimple ?? streamSimple)(
        model,
        normalizeReasoningReplay(model, context),
        simpleOptions,
      ),
  };
}
