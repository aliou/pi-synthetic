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

export interface SyntheticApiModelPricing {
  prompt: string;
  completion: string;
  input_cache_reads: string;
  input_cache_writes: string;
}

export interface SyntheticApiModel {
  id: string;
  name: string;
  provider: string | null;
  hugging_face_id?: string;
  input_modalities: string[];
  output_modalities: string[];
  context_length: number;
  max_output_length: number;
  pricing: SyntheticApiModelPricing;
  supported_features?: string[];
}

export interface SyntheticModelsResponse {
  data?: SyntheticApiModel[];
  [key: string]: unknown;
}

export interface SyntheticQuotasResponse {
  quotas: QuotasResponse;
}
