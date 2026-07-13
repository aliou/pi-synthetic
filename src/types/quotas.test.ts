import { describe, expect, it } from "vitest";
import { parseQuotaHeader } from "./quotas";

describe("parseQuotaHeader", () => {
  it("parses valid quota payloads", () => {
    expect(
      parseQuotaHeader({
        "x-synthetic-quotas": JSON.stringify({
          subscription: { limit: 100, requests: 5, renewsAt: "later" },
        }),
      }),
    ).toEqual({
      subscription: { limit: 100, requests: 5, renewsAt: "later" },
    });
  });

  it("rejects payloads that do not match the quota schema", () => {
    expect(
      parseQuotaHeader({ "x-synthetic-quotas": JSON.stringify([]) }),
    ).toBeUndefined();
    expect(
      parseQuotaHeader({
        "x-synthetic-quotas": JSON.stringify({ subscription: {} }),
      }),
    ).toBeUndefined();
  });
});
