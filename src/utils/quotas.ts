import {
  resolveSyntheticUtilityApiBaseUrl,
  syntheticUtilityApiUrl,
} from "../lib/utility-api";
import type { QuotasResponse, QuotasResult } from "../types/quotas";

const FETCH_TIMEOUT_MS = 15_000;

export interface FetchQuotasOptions {
  apiKey?: string;
  proxyUrl?: string;
  requiresAuth?: boolean;
  signal?: AbortSignal;
}

function isTimeoutReason(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "TimeoutError") ||
    (reason instanceof Error && reason.name === "TimeoutError")
  );
}

export async function fetchQuotas(
  options: FetchQuotasOptions,
): Promise<QuotasResult> {
  const requiresAuth = options.requiresAuth ?? true;
  if (requiresAuth && !options.apiKey) {
    return {
      success: false,
      error: { message: "No API key provided", kind: "config" },
    };
  }

  let url: string;
  try {
    const baseUrl = resolveSyntheticUtilityApiBaseUrl(options.proxyUrl);
    url = syntheticUtilityApiUrl(baseUrl, "/v2/quotas");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid proxy URL";
    return { success: false, error: { message, kind: "config" } };
  }

  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (options.signal) signals.push(options.signal);
  const combined = AbortSignal.any(signals);

  try {
    const headers: Record<string, string> = {};
    if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    const response = await fetch(url, {
      headers,
      signal: combined,
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.text();
        if (body) {
          try {
            const parsed = JSON.parse(body) as { error?: string };
            if (parsed.error) message = parsed.error;
          } catch {
            message = body;
          }
        }
      } catch {
        return { success: false, error: { message, kind: "http" } };
      }
      return { success: false, error: { message, kind: "http" } };
    }

    const data: QuotasResponse = await response.json();
    return { success: true, data: { quotas: data } };
  } catch (err: unknown) {
    const isAbort =
      combined.aborted ||
      (err instanceof DOMException && err.name === "AbortError");
    if (isAbort) {
      if (isTimeoutReason(combined.reason)) {
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

export function formatResetTime(renewsAt: string): string {
  const date = new Date(renewsAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "soon";

  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
