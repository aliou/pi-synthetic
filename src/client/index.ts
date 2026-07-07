export { SyntheticClient } from "./synthetic-client";
export type {
  SyntheticClientOptions,
  SyntheticClientRequestOptions,
  SyntheticModelsResponse,
  SyntheticSearchResponse,
  SyntheticSearchResult,
  SyntheticUtilityApiConfig,
} from "./types";
export {
  DEFAULT_SYNTHETIC_API_BASE_URL,
  formatSyntheticUtilityApiProxySummary,
  hasSyntheticUtilityApiProxy,
  resolveSyntheticClientOptions,
  resolveSyntheticUtilityApiBaseUrl,
  syntheticUtilityApiRequiresAuth,
  validateSyntheticUtilityApiProxyUrl,
} from "./utility-api";
