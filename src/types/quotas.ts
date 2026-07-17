import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

export type QuotaSource = "header" | "api";

const RequestQuotaSchema = Type.Object({
  limit: Type.Number(),
  requests: Type.Number(),
  renewsAt: Type.String(),
});

export const QuotasResponseSchema = Type.Object({
  subscription: Type.Optional(RequestQuotaSchema),
  search: Type.Optional(
    Type.Object({
      hourly: Type.Optional(RequestQuotaSchema),
    }),
  ),
  freeToolCalls: Type.Optional(RequestQuotaSchema),
  weeklyTokenLimit: Type.Optional(
    Type.Object({
      nextRegenAt: Type.String(),
      percentRemaining: Type.Number(),
      maxCredits: Type.String(),
      remainingCredits: Type.String(),
      nextRegenCredits: Type.String(),
    }),
  ),
  rollingFiveHourLimit: Type.Optional(
    Type.Object({
      nextTickAt: Type.String(),
      tickPercent: Type.Number(),
      remaining: Type.Number(),
      max: Type.Number(),
      limited: Type.Boolean(),
    }),
  ),
});

export type QuotasResponse = Static<typeof QuotasResponseSchema>;

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
    return Value.Check(QuotasResponseSchema, parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
