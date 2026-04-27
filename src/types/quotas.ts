export type QuotaSource = "header" | "api";

export const SYNTHETIC_QUOTAS_UPDATED_EVENT =
  "synthetic:quotas:updated" as const;

export const SYNTHETIC_QUOTAS_REQUEST_EVENT =
  "synthetic:quotas:request" as const;

export interface SyntheticQuotasUpdatedPayload {
  quotas: QuotasResponse;
  source: QuotaSource;
}

export type QuotasErrorKind =
  | "cancelled"
  | "timeout"
  | "config"
  | "http"
  | "network";

export type QuotasResult =
  | { success: true; data: { quotas: QuotasResponse } }
  | { success: false; error: { message: string; kind: QuotasErrorKind } };

export interface QuotasResponse {
  subscription?: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
  search?: {
    hourly?: {
      limit: number;
      requests: number;
      renewsAt: string;
    };
  };
  freeToolCalls?: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
  weeklyTokenLimit?: {
    nextRegenAt: string;
    percentRemaining: number;
    maxCredits: string;
    remainingCredits: string;
    nextRegenCredits: string;
  };
  rollingFiveHourLimit?: {
    nextTickAt: string;
    tickPercent: number;
    remaining: number;
    max: number;
    limited: boolean;
  };
}

/** Parse the `x-synthetic-quotas` header value into a QuotasResponse.
 *  Returns undefined if the header is missing or invalid. */
export function parseQuotaHeader(
  headers: Record<string, string>,
): QuotasResponse | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "x-synthetic-quotas",
  );
  if (!entry?.[1]) return undefined;
  try {
    const parsed = JSON.parse(entry[1]);
    // Basic structural check: must be a non-null object
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return undefined;
    return parsed as QuotasResponse;
  } catch {
    return undefined;
  }
}
