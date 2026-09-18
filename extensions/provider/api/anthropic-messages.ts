import type { Api, Model, ProviderHeaders } from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import {
  SYNTHETIC_ANTHROPIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
} from "../constants";
import type { SyntheticModel } from "../models";
import type { AnyStreamSimple, SyntheticApiHandler } from "./types";

/**
 * Verified live (2026-09): these models cannot disable reasoning on the
 * Anthropic surface even with thinking:{type:"disabled"} — GLM-5.3-Flash is
 * the only model that ignores the disable; `syn:large:text` routes to it.
 * The efforts enum does not predict disableability, so this stays an explicit
 * allowlist of known non-disableable models.
 */
const ANTHROPIC_NON_DISABLEABLE_MODELS = new Set<string>([
  "syn:large:text",
  "hf:zai-org/GLM-5.3-Flash",
]);

/**
 * The Anthropic surface honors first-party reasoning semantics: off goes
 * through thinking:{type:"disabled"} via pi-ai's stock adapter, while
 * positive levels are binary here (output_config.effort is accepted but not
 * acted on), so only `off` is mapped and positive levels stay null.
 */
export function stampModels(models: SyntheticModel[]): Model<Api>[] {
  return models.map((model) => ({
    ...model,
    api: "anthropic-messages" as const,
    provider: SYNTHETIC_PROVIDER_ID,
    baseUrl: SYNTHETIC_ANTHROPIC_BASE_URL,
    headers: SYNTHETIC_REQUEST_HEADERS,
    thinkingLevelMap: {
      off:
        model.reasoning && !ANTHROPIC_NON_DISABLEABLE_MODELS.has(model.id)
          ? "none"
          : null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    },
    compat: {
      supportsTemperature: true,
      supportsStrictTools: false,
    },
  }));
}

interface OptionsWithAuth {
  apiKey?: string;
  headers?: ProviderHeaders;
}

/**
 * The Anthropic SDK sends `x-api-key`, but Synthetic's Anthropic surface
 * authenticates with `authorization: Bearer` (verified live). Sending both is
 * harmless, so inject the Bearer header from the resolved key. No key means
 * the request cannot authenticate anyway; leave the options untouched.
 */
export function withBearerAuth<T extends OptionsWithAuth>(
  options?: T,
): T | undefined {
  if (!options?.apiKey) return options;
  const { apiKey, headers } = options;
  return {
    ...options,
    headers: { ...headers, Authorization: `Bearer ${apiKey}` },
  };
}

export function createAnthropicMessagesApi(options?: {
  streamSimple?: AnyStreamSimple;
}): SyntheticApiHandler {
  return {
    stampModels,
    stream: (model, context, streamOptions) =>
      stream(model, context, withBearerAuth(streamOptions) as never),
    streamSimple: (model, context, simpleOptions) =>
      (options?.streamSimple ?? streamSimple)(
        model,
        context,
        withBearerAuth(simpleOptions) as never,
      ),
  };
}
