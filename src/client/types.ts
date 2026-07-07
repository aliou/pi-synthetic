import type { QuotasResponse } from "../types/quotas";

export interface SyntheticUtilityApiConfig {
  proxyUrl?: string;
  proxyRequiresAuth?: boolean;
}

export interface SyntheticClientOptions {
  apiKey?: string;
  proxyUrl?: string;
  requiresAuth?: boolean;
}

export interface SyntheticClientRequestOptions {
  signal?: AbortSignal;
}

export interface SyntheticSearchResult {
  url: string;
  title: string;
  text: string;
  published: string;
}

export interface SyntheticSearchResponse {
  results: SyntheticSearchResult[];
}

export interface SyntheticModelsResponse {
  data?: unknown[];
  [key: string]: unknown;
}

export interface SyntheticQuotasResponse {
  quotas: QuotasResponse;
}
