import { assert, beforeEach, describe, expect, it } from "vitest";
import type { QuotasResponse } from "../../types/quotas";
import { assessWindow, type QuotaWindow } from "../../utils/quotas-severity";
import {
  clearAlertState,
  findHighRiskWindows,
  formatWarningMessage,
  markNotified,
  shouldNotify,
} from "./notifier";

// Access the module-scoped windowAlerts map for test inspection.
// We import the module and rely on clearAlertState() to reset between tests.
//
// Since windowAlerts is not exported, we test shouldNotify/markNotified
// by observing their behavior (the state machine) rather than reading the map directly.

beforeEach(() => {
  clearAlertState();
});

describe("shouldNotify", () => {
  it("notifies on first time seeing a window at risk", () => {
    expect(shouldNotify("Credits / week", "warning")).toBe(true);
    expect(shouldNotify("Requests / 5h", "high")).toBe(true);
    expect(shouldNotify("Search / hour", "critical")).toBe(true);
  });

  it("notifies on severity escalation", () => {
    markNotified("Credits / week", "warning");
    expect(shouldNotify("Credits / week", "high")).toBe(true);

    markNotified("Requests / 5h", "high");
    expect(shouldNotify("Requests / 5h", "critical")).toBe(true);
  });

  it("notifies on skip from none to any risk level", () => {
    // When a window was at "none" (implicitly, by not being in the map)
    // and escalates, it's first-time => true. But also test explicit none->warning.
    markNotified("Test", "none");
    expect(shouldNotify("Test", "warning")).toBe(true);
  });

  it("does not notify on same severity for warning within cooldown", () => {
    markNotified("Credits / week", "warning");
    expect(shouldNotify("Credits / week", "warning")).toBe(false);
  });

  it("does not notify on downgrade to warning", () => {
    markNotified("Credits / week", "high");
    expect(shouldNotify("Credits / week", "warning")).toBe(false);
  });

  it("does notify on downgrade to high (no cooldown)", () => {
    // high always re-notifies regardless of previous severity
    markNotified("Requests / 5h", "critical");
    expect(shouldNotify("Requests / 5h", "high")).toBe(true);
  });

  it("always notifies for high severity (no cooldown)", () => {
    markNotified("Credits / week", "high");
    // Same severity, but high always re-notifies
    expect(shouldNotify("Credits / week", "high")).toBe(true);
  });

  it("always notifies for critical severity (no cooldown)", () => {
    markNotified("Credits / week", "critical");
    expect(shouldNotify("Credits / week", "critical")).toBe(true);
  });
});

describe("markNotified", () => {
  it("tracks severity per window key", () => {
    markNotified("Credits / week", "warning");
    // After marking as warning, re-checking warning should be blocked
    expect(shouldNotify("Credits / week", "warning")).toBe(false);

    // But a different key is independent
    expect(shouldNotify("Requests / 5h", "warning")).toBe(true);
  });

  it("allows re-notification after escalation then downgrade then re-escalation", () => {
    markNotified("Test", "high");
    // Downgrade doesn't notify but updates state
    expect(shouldNotify("Test", "warning")).toBe(false);
    // Re-escalation notifies
    expect(shouldNotify("Test", "high")).toBe(true);
  });
});

describe("clearAlertState", () => {
  it("resets all alert state so windows notify again", () => {
    markNotified("Credits / week", "warning");
    expect(shouldNotify("Credits / week", "warning")).toBe(false);

    clearAlertState();

    expect(shouldNotify("Credits / week", "warning")).toBe(true);
  });
});

describe("findHighRiskWindows", () => {
  const baseQuotas: QuotasResponse = {
    weeklyTokenLimit: {
      nextRegenAt: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
      percentRemaining: 90, // 10% used
      maxCredits: "$10.00",
      remainingCredits: "$9.00",
      nextRegenCredits: "$0.50",
    },
    rollingFiveHourLimit: {
      nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
      tickPercent: 10,
      remaining: 90,
      max: 100,
      limited: false,
    },
    search: {
      hourly: {
        limit: 100,
        requests: 10, // 10% used
        renewsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    },
    freeToolCalls: {
      limit: 100,
      requests: 5, // 5% used
      renewsAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    },
  };

  it("returns empty for low-usage quotas", () => {
    const risks = findHighRiskWindows(baseQuotas);
    // All windows have low usage, most should be "none"
    // The 5h window at 10% used with no pace => "none"
    // Weekly at 10% with paceScale 1/7 => very low projected => "none"
    expect(risks).toHaveLength(0);
  });

  it("finds windows with high usage", () => {
    const quotas: QuotasResponse = {
      ...baseQuotas,
      rollingFiveHourLimit: {
        nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
        tickPercent: 10,
        remaining: 5,
        max: 100,
        limited: false,
      },
    };
    const risks = findHighRiskWindows(quotas);
    // 95% used, no pace => static: >=90 => high
    const fiveHourRisk = risks.find((r) => r.window.label === "Requests / 5h");
    assert(fiveHourRisk, "fiveHourRisk should exist");
    expect(fiveHourRisk.assessment.severity).toBe("high");
  });

  it("finds limited windows even with low usage", () => {
    const quotas: QuotasResponse = {
      ...baseQuotas,
      rollingFiveHourLimit: {
        nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
        tickPercent: 10,
        remaining: 95,
        max: 100,
        limited: true,
      },
    };
    const risks = findHighRiskWindows(quotas);
    const fiveHourRisk = risks.find((r) => r.window.label === "Requests / 5h");
    assert(fiveHourRisk, "fiveHourRisk should exist");
    expect(fiveHourRisk.assessment.severity).toBe("critical");
  });

  it("returns empty for quotas with no windows", () => {
    const quotas: QuotasResponse = {};
    expect(findHighRiskWindows(quotas)).toHaveLength(0);
  });
});

describe("formatWarningMessage", () => {
  it("formats single window warning", () => {
    const w: QuotaWindow = {
      label: "Requests / 5h",
      usedPercent: 92,
      resetsAt: new Date(Date.now() + 2 * 3600 * 1000),
      windowSeconds: 5 * 3600,
      usedValue: 92,
      limitValue: 100,
      showPace: false,
    };
    const assessment = assessWindow(w);
    const msg = formatWarningMessage([{ window: w, assessment }]);
    expect(msg).toContain("Synthetic quota warning:");
    expect(msg).toContain("Requests / 5h");
    expect(msg).toContain("92% used");
    expect(msg).toContain("projected");
  });

  it("formats multiple windows", () => {
    const w1: QuotaWindow = {
      label: "Credits / week",
      usedPercent: 85,
      resetsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000),
      windowSeconds: 7 * 24 * 3600,
      usedValue: 85,
      limitValue: 100,
      showPace: true,
      paceScale: 1 / 7,
    };
    const w2: QuotaWindow = {
      label: "Requests / 5h",
      usedPercent: 92,
      resetsAt: new Date(Date.now() + 2 * 3600 * 1000),
      windowSeconds: 5 * 3600,
      usedValue: 92,
      limitValue: 100,
      showPace: false,
    };
    const msg = formatWarningMessage([
      { window: w1, assessment: assessWindow(w1) },
      { window: w2, assessment: assessWindow(w2) },
    ]);
    expect(msg).toContain("Credits / week");
    expect(msg).toContain("Requests / 5h");
    // Two separate lines
    const lines = msg.split("\n");
    expect(lines).toHaveLength(3); // header + 2 windows
  });

  it("includes severity label for non-none severities", () => {
    const w: QuotaWindow = {
      label: "Requests / 5h",
      usedPercent: 92,
      resetsAt: new Date(Date.now() + 2 * 3600 * 1000),
      windowSeconds: 5 * 3600,
      usedValue: 92,
      limitValue: 100,
      showPace: false,
    };
    const msg = formatWarningMessage([
      { window: w, assessment: assessWindow(w) },
    ]);
    expect(msg).toMatch(/\(high\)/);
  });
});

describe("notification flow (shouldNotify + markNotified integration)", () => {
  it("notifies once on first warning, blocks repeat, notifies on escalation", () => {
    // 1. First warning
    expect(shouldNotify("Credits / week", "warning")).toBe(true);
    markNotified("Credits / week", "warning");

    // 2. Same severity within cooldown
    expect(shouldNotify("Credits / week", "warning")).toBe(false);

    // 3. Escalation to high
    expect(shouldNotify("Credits / week", "high")).toBe(true);
    markNotified("Credits / week", "high");

    // 4. High always re-notifies (no cooldown)
    expect(shouldNotify("Credits / week", "high")).toBe(true);
  });

  it("allows re-notification after clear", () => {
    expect(shouldNotify("Credits / week", "warning")).toBe(true);
    markNotified("Credits / week", "warning");
    expect(shouldNotify("Credits / week", "warning")).toBe(false);

    clearAlertState();

    expect(shouldNotify("Credits / week", "warning")).toBe(true);
  });

  it("tracks windows independently", () => {
    markNotified("Credits / week", "warning");
    expect(shouldNotify("Credits / week", "warning")).toBe(false);
    expect(shouldNotify("Search / hour", "warning")).toBe(true);
  });
});
