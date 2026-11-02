export type SyntheticFeatureId =
  | "webSearch"
  | "quotasCommand"
  | "usageStatus"
  | "quotaWarnings";

/**
 * Synthetic serves every chat model twice: on an OpenAI-compatible
 * `/openai/v1` endpoint and on an Anthropic-compatible `/anthropic` endpoint.
 * Exactly one serves the provider at a time.
 */
export type SyntheticApi = "openai-completions" | "anthropic-messages";

export const SYNTHETIC_EXTENSIONS_REQUEST_EVENT =
  "synthetic:extensions:request" as const;

export const SYNTHETIC_EXTENSIONS_REGISTER_EVENT =
  "synthetic:extensions:register" as const;

export interface SyntheticExtensionsRegisterPayload {
  feature: SyntheticFeatureId;
}

export interface SyntheticConfig {
  configVersion?: string;
  /** Which API serves model requests. Changes require a reload. */
  api?: SyntheticApi;
  webSearch?: boolean;
  quotasCommand?: boolean;
  usageStatus?: boolean;
  quotaWarnings?: boolean;
  proxyUrl?: string;
  proxyRequiresAuth?: boolean;
}

export interface ResolvedSyntheticConfig {
  configVersion: string;
  api: SyntheticApi;
  webSearch: boolean;
  quotasCommand: boolean;
  usageStatus: boolean;
  quotaWarnings: boolean;
  proxyUrl: string;
  proxyRequiresAuth: boolean;
}

export const SYNTHETIC_CONFIG_UPDATED_EVENT =
  "synthetic:config:updated" as const;

export interface SyntheticConfigUpdatedPayload {
  config: ResolvedSyntheticConfig;
}
