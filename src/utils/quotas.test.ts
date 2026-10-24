import { describe, expect, it } from "vitest";
import type { QuotasResponse } from "../types/quotas";
import { detectBillingMode } from "./quotas";

describe("detectBillingMode", () => {
  it.each([
    {
      planWeeklyLimit: {
        nextRegenAt: "later",
        percentRemaining: 50,
        nextRegenPercent: 2,
      },
    },
    {
      weeklyTokenLimit: {
        nextRegenAt: "later",
        percentRemaining: 50,
        maxCredits: "$10",
        remainingCredits: "$5",
        nextRegenCredits: "$1",
      },
    },
    {
      rollingFiveHourLimit: {
        nextTickAt: "later",
        tickPercent: 50,
        remaining: 5,
        max: 10,
        limited: false,
      },
    },
  ])("recognizes subscription quota windows", (quotas) => {
    expect(detectBillingMode(quotas)).toBe("subscription");
  });

  it("recognizes empty and missing quotas as pay-as-you-go", () => {
    expect(detectBillingMode({})).toBe("pay-as-you-go");
    expect(detectBillingMode(undefined)).toBe("pay-as-you-go");
  });

  it("rejects malformed subscription quota windows", () => {
    expect(
      detectBillingMode({
        planWeeklyLimit: { nextRegenAt: "later" },
      } as unknown as QuotasResponse),
    ).toBe("pay-as-you-go");
    expect(
      detectBillingMode({
        weeklyTokenLimit: true,
      } as unknown as QuotasResponse),
    ).toBe("pay-as-you-go");
  });
});
