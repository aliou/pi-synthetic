import type { QuotasResponse, QuotasResult } from "../types/quotas";
import type {
  SyntheticClientOptions,
  SyntheticClientRequestOptions,
  SyntheticModelsResponse,
  SyntheticSearchResponse,
} from "./types";
import {
  DEFAULT_SYNTHETIC_API_BASE_URL,
  resolveSyntheticUtilityApiBaseUrl,
  syntheticUtilityApiUrl,
} from "./utility-api";
import {
  authHeaders,
  combineWithTimeout,
  isTimeoutReason,
  parseErrorMessage,
} from "./utils";

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
      const data = await response.json();
      return data as SyntheticSearchResponse;
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

    const data = await response.json();
    return data as SyntheticModelsResponse;
  }
}
