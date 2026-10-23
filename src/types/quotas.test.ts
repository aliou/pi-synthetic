import { describe, expect, it } from "vitest";
import { parseQuotaHeader } from "./quotas";

describe("parseQuotaHeader", () => {
  it("parses valid quota payloads", () => {
    expect(
      parseQuotaHeader({
        "x-synthetic-quotas": JSON.stringify({
          planWeeklyLimit: {
            nextRegenAt: "later",
            percentRemaining: 51.7,
            nextRegenPercent: 2,
          },
          search: {
            hourly: { limit: 250, requests: 5, renewsAt: "later" },
          },
        }),
      }),
    ).toEqual({
      planWeeklyLimit: {
        nextRegenAt: "later",
        percentRemaining: 51.7,
        nextRegenPercent: 2,
      },
      search: {
        hourly: { limit: 250, requests: 5, renewsAt: "later" },
      },
    });
  });

  it("parses legacy weekly and rolling windows", () => {
    expect(
      parseQuotaHeader({
        "x-synthetic-quotas": JSON.stringify({
          weeklyTokenLimit: {
            nextRegenAt: "later",
            percentRemaining: 50,
            maxCredits: "$10",
            remainingCredits: "$5",
            nextRegenCredits: "$1",
          },
          rollingFiveHourLimit: {
            nextTickAt: "later",
            tickPercent: 0.05,
            remaining: 5,
            max: 10,
            limited: false,
          },
        }),
      }),
    ).toEqual({
      weeklyTokenLimit: {
        nextRegenAt: "later",
        percentRemaining: 50,
        maxCredits: "$10",
        remainingCredits: "$5",
        nextRegenCredits: "$1",
      },
      rollingFiveHourLimit: {
        nextTickAt: "later",
        tickPercent: 0.05,
        remaining: 5,
        max: 10,
        limited: false,
      },
    });
  });

  it("rejects payloads that do not match the quota schema", () => {
    expect(
      parseQuotaHeader({ "x-synthetic-quotas": JSON.stringify([]) }),
    ).toBeUndefined();
    expect(
      parseQuotaHeader({
        "x-synthetic-quotas": JSON.stringify({ planWeeklyLimit: {} }),
      }),
    ).toBeUndefined();
    expect(
      parseQuotaHeader({
        "x-synthetic-quotas": JSON.stringify({ weeklyTokenLimit: {} }),
      }),
    ).toBeUndefined();
  });
});
