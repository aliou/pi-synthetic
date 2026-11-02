import type {
  Api,
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
  StreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import type { SyntheticModel } from "../models";

export type AnyStreamSimple = (
  model: Model<string>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

/** One Synthetic API surface: model stamping plus submission plumbing. */
export interface SyntheticApiHandler {
  stampModels(models: SyntheticModel[]): Model<Api>[];
  stream(
    model: Model<Api>,
    context: TranscriptContext,
    options?: StreamOptions,
  ): AssistantMessageEventStream;
  streamSimple: AnyStreamSimple;
}
