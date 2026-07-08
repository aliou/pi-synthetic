export type QuotaSource = "header" | "api";

/** Refill-aware projection for a quota window, derived from recent snapshots.
 *
 * - `stable`: net drain <= 0; the quota is refilling at least as fast as it is
 *   being consumed, so no forward-looking warning is warranted.
 * - `projected`: net drain > 0; `usedPercent` is where usage is expected to be
 *   after `horizonMs`, accounting for both burn and refill.
 */
export type ProjectionHint =
  | { kind: "stable" }
  | { kind: "projected"; usedPercent: number; horizonMs: number };

export const SYNTHETIC_QUOTAS_UPDATED_EVENT =
  "synthetic:quotas:updated" as const;

export const SYNTHETIC_QUOTAS_REQUEST_EVENT =
  "synthetic:quotas:request" as const;

export const SYNTHETIC_QUOTAS_READ_EVENT = "synthetic:quotas:read" as const;

export interface SyntheticQuotasSnapshotPayload {
  quotas: QuotasResponse;
  source: QuotaSource;
  updatedAt: number; // epoch ms
  /** Refill-aware projections keyed by quota window id (e.g. "rollingFiveHourLimit").
   * Only present when the store has enough history to compute one. */
  projections?: Map<string, ProjectionHint>;
}

export interface SyntheticQuotasUpdatedPayload
  extends SyntheticQuotasSnapshotPayload {}

export interface SyntheticQuotasReadPayload {
  respond: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void;
}

export interface SyntheticQuotasRequestPayload {
  respond?: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void;
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
  headers: Record<string, string> | undefined,
): QuotasResponse | undefined {
  if (!headers) return undefined;
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
