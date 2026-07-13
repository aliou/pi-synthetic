import { describe, expect, it } from "vitest";
import { shouldActivateWebSearch } from "./index";

describe("shouldActivateWebSearch", () => {
  it("requires both the setting and a confirmed subscription", () => {
    expect(shouldActivateWebSearch(false, "subscription")).toBe(false);
    expect(shouldActivateWebSearch(true, "unknown")).toBe(false);
    expect(shouldActivateWebSearch(true, "pay-as-you-go")).toBe(false);
    expect(shouldActivateWebSearch(true, "subscription")).toBe(true);
  });
});
