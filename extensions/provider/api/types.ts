import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
  StreamOptions,
} from "@earendil-works/pi-ai";
import type { SyntheticModel } from "../models";

export type AnyStreamSimple = (
  model: Model<string>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

/** One Synthetic API surface: model stamping plus submission plumbing. */
export interface SyntheticApiHandler {
  stampModels(models: SyntheticModel[]): Model<Api>[];
  stream(
    model: Model<Api>,
    context: Context,
    options?: StreamOptions,
  ): AssistantMessageEventStream;
  streamSimple: AnyStreamSimple;
}
