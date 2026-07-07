import type { QuotasResponse, QuotasResult } from "../types/quotas";

export const DEFAULT_SYNTHETIC_API_BASE_URL = "https://api.synthetic.new";

const FETCH_TIMEOUT_MS = 15_000;

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

export function hasSyntheticUtilityApiProxy(
  config: SyntheticUtilityApiConfig,
): boolean {
  return !!config.proxyUrl?.trim();
}

export function syntheticUtilityApiRequiresAuth(
  config: SyntheticUtilityApiConfig,
): boolean {
  return (
    !hasSyntheticUtilityApiProxy(config) || config.proxyRequiresAuth !== false
  );
}

export function validateSyntheticUtilityApiProxyUrl(
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Proxy URL must be a valid URL";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Proxy URL must use http or https";
  }

  return null;
}

export function resolveSyntheticUtilityApiBaseUrl(proxyUrl?: string): string {
  const raw = proxyUrl?.trim() || DEFAULT_SYNTHETIC_API_BASE_URL;
  const error = validateSyntheticUtilityApiProxyUrl(raw);
  if (error) {
    throw new Error(`Synthetic utility API: ${error}`);
  }
  return raw.replace(/\/+$/, "");
}

export function syntheticUtilityApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function formatSyntheticUtilityApiProxySummary(
  config: SyntheticUtilityApiConfig,
): string {
  if (!hasSyntheticUtilityApiProxy(config)) return "direct";
  const auth = syntheticUtilityApiRequiresAuth(config) ? "auth" : "no auth";
  return `${config.proxyUrl?.trim()} · ${auth}`;
}

export interface ResolvedSyntheticUtilityApiAuth {
  apiKey: string | undefined;
  requiresAuth: boolean;
}

/**
 * Resolve the auth state for a utility API request.
 *
 * - When auth is required (direct calls, or proxy with auth enabled), the
 *   provided `getApiKey` callback is awaited. Returns `null` if no key is
 *   available, so callers can surface a missing-credentials error.
 * - When auth is not required (unauthenticated proxy), `apiKey` is left
 *   `undefined` and the Synthetic API key check is skipped.
 */
export async function resolveSyntheticUtilityApiAuth(
  config: SyntheticUtilityApiConfig,
  getApiKey: () => Promise<string | undefined>,
): Promise<ResolvedSyntheticUtilityApiAuth | null> {
  const requiresAuth = syntheticUtilityApiRequiresAuth(config);
  const apiKey = requiresAuth ? await getApiKey() : undefined;
  if (requiresAuth && !apiKey) return null;
  return { apiKey, requiresAuth };
}

function isTimeoutReason(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "TimeoutError") ||
    (reason instanceof Error && reason.name === "TimeoutError")
  );
}

function combineWithTimeout(signal?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  return AbortSignal.any(signals);
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function parseErrorMessage(response: Response): Promise<string> {
  const message = response.statusText;
  try {
    const body = await response.text();
    if (!body) return message;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      return parsed.error || body;
    } catch {
      return body;
    }
  } catch {
    return message;
  }
}

export class SyntheticClient {
  private readonly apiKey: string | undefined;
  private readonly proxyUrl: string | undefined;
  private readonly requiresAuth: boolean;

  constructor(options: SyntheticClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.proxyUrl = options.proxyUrl;
    this.requiresAuth = options.requiresAuth ?? true;
  }

  private resolveBaseUrl(): string {
    return resolveSyntheticUtilityApiBaseUrl(this.proxyUrl);
  }

  async quotas(
    options: SyntheticClientRequestOptions = {},
  ): Promise<QuotasResult> {
    if (this.requiresAuth && !this.apiKey) {
      return {
        success: false,
        error: { message: "No API key provided", kind: "config" },
      };
    }

    let baseUrl: string;
    try {
      baseUrl = this.resolveBaseUrl();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid proxy URL";
      return { success: false, error: { message, kind: "config" } };
    }

    const signal = combineWithTimeout(options.signal);

    try {
      const response = await fetch(
        syntheticUtilityApiUrl(baseUrl, "/v2/quotas"),
        {
          headers: authHeaders(this.apiKey),
          signal,
        },
      );

      if (!response.ok) {
        return {
          success: false,
          error: { message: await parseErrorMessage(response), kind: "http" },
        };
      }

      const data: QuotasResponse = await response.json();
      return { success: true, data: { quotas: data } };
    } catch (err: unknown) {
      const isAbort =
        signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError");
      if (isAbort) {
        if (isTimeoutReason(signal.reason)) {
          return {
            success: false,
            error: { message: "Request timed out", kind: "timeout" },
          };
        }
        return {
          success: false,
          error: { message: "Request cancelled", kind: "cancelled" },
        };
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: { message, kind: "network" } };
    }
  }

  async search(
    query: string,
    options: SyntheticClientRequestOptions = {},
  ): Promise<SyntheticSearchResponse> {
    if (this.requiresAuth && !this.apiKey) {
      throw new Error("No API key provided");
    }

    const response = await fetch(
      syntheticUtilityApiUrl(this.resolveBaseUrl(), "/v2/search"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(this.apiKey),
        },
        body: JSON.stringify({ query }),
        signal: options.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search API error: ${response.status} ${errorText}`);
    }

    try {
      return (await response.json()) as SyntheticSearchResponse;
    } catch (parseError) {
      throw new Error(
        parseError instanceof Error
          ? `Failed to parse search results: ${parseError.message}`
          : "Failed to parse search results",
      );
    }
  }

  async models(
    options: SyntheticClientRequestOptions = {},
  ): Promise<SyntheticModelsResponse> {
    const response = await fetch(
      syntheticUtilityApiUrl(
        DEFAULT_SYNTHETIC_API_BASE_URL,
        "/openai/v1/models",
      ),
      {
        headers: authHeaders(this.apiKey),
        signal: options.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Synthetic models API error: ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as SyntheticModelsResponse;
  }
}

export function createSyntheticClient(
  options: SyntheticClientOptions = {},
): SyntheticClient {
  return new SyntheticClient(options);
}
