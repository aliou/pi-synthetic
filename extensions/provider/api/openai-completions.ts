import type { Model } from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import {
  SYNTHETIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
} from "../constants";
import type { SyntheticModel } from "../models";
import { withReasoningReplay } from "./reasoning-replay";
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

export function createOpenAiCompletionsApi(options?: {
  streamSimple?: AnyStreamSimple;
}): SyntheticApiHandler {
  return {
    stampModels: toOpenAiCompletionsModels,
    stream: (model, context, streamOptions) =>
      stream(
        model,
        context,
        withReasoningReplay(model, streamOptions) as never,
      ),
    streamSimple: (model, context, simpleOptions) =>
      (options?.streamSimple ?? streamSimple)(
        model,
        context,
        withReasoningReplay(model, simpleOptions) as never,
      ),
  };
}
