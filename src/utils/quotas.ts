import { Type } from "typebox";
import { Value } from "typebox/value";
import type { QuotasResponse } from "../types/quotas";

export type BillingMode = "subscription" | "pay-as-you-go";

const SubscriptionQuotaSchema = Type.Object({
  limit: Type.Number(),
  requests: Type.Number(),
  renewsAt: Type.String(),
});

const WeeklyTokenLimitSchema = Type.Object({
  nextRegenAt: Type.String(),
  percentRemaining: Type.Number(),
  maxCredits: Type.String(),
  remainingCredits: Type.String(),
  nextRegenCredits: Type.String(),
});

const RollingFiveHourLimitSchema = Type.Object({
  nextTickAt: Type.String(),
  tickPercent: Type.Number(),
  remaining: Type.Number(),
  max: Type.Number(),
  limited: Type.Boolean(),
});

/**
 * Synthetic subscription accounts expose at least one subscription quota
 * window. PAYG accounts return an empty quota object or legacy tool windows.
 */
export function detectBillingMode(
  quotas: QuotasResponse | undefined,
): BillingMode {
  return Value.Check(SubscriptionQuotaSchema, quotas?.subscription) ||
    Value.Check(WeeklyTokenLimitSchema, quotas?.weeklyTokenLimit) ||
    Value.Check(RollingFiveHourLimitSchema, quotas?.rollingFiveHourLimit)
    ? "subscription"
    : "pay-as-you-go";
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
