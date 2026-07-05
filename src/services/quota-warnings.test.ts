import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ProjectionHint, QuotasResponse } from "../types/quotas";
import { assessWindow, type QuotaWindow } from "../utils/quotas-severity";
import { type NotifyFn, QuotaWarningNotifier } from "./quota-warnings";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QuotaWarningNotifier", () => {
  const baseQuotas: QuotasResponse = {
    weeklyTokenLimit: {
      nextRegenAt: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
      percentRemaining: 90,
      maxCredits: "$10.00",
      remainingCredits: "$9.00",
      nextRegenCredits: "$0.50",
    },
    rollingFiveHourLimit: {
      nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
      tickPercent: 0.05,
      remaining: 90,
      max: 100,
      limited: false,
    },
    search: {
      hourly: {
        limit: 100,
        requests: 10,
        renewsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    },
    freeToolCalls: {
      limit: 100,
      requests: 5,
      renewsAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    },
  };

  describe("shouldNotify", () => {
    it("notifies on first time seeing a window at risk", () => {
      const notifier = new QuotaWarningNotifier();
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(true);
      expect(notifier.shouldNotify("Requests / 5h", "high")).toBe(true);
      expect(notifier.shouldNotify("Search / hour", "critical")).toBe(true);
    });

    it("notifies on severity escalation", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "warning");
      expect(notifier.shouldNotify("Credits / week", "high")).toBe(true);

      notifier.markNotified("Requests / 5h", "high");
      expect(notifier.shouldNotify("Requests / 5h", "critical")).toBe(true);
    });

    it("notifies on skip from none to any risk level", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Test", "none");
      expect(notifier.shouldNotify("Test", "warning")).toBe(true);
    });

    it("does not notify on same severity for warning within cooldown", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "warning");
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);
    });

    it("does notify on warning after cooldown elapsed", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "warning");

      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(true);
    });

    it("does not notify on downgrade to warning", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "high");
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);
    });

    it("does not notify on downgrade to high within cooldown", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Requests / 5h", "critical");
      expect(notifier.shouldNotify("Requests / 5h", "high")).toBe(false);
    });

    it("suppresses repeated high severity within cooldown", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "high");
      expect(notifier.shouldNotify("Credits / week", "high")).toBe(false);
    });

    it("re-notifies high severity after cooldown elapsed", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "high");

      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      expect(notifier.shouldNotify("Credits / week", "high")).toBe(true);
    });

    it("suppresses repeated critical severity within cooldown", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "critical");
      expect(notifier.shouldNotify("Credits / week", "critical")).toBe(false);
    });

    it("re-notifies critical severity after cooldown elapsed", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "critical");

      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      expect(notifier.shouldNotify("Credits / week", "critical")).toBe(true);
    });
  });

  describe("markNotified", () => {
    it("tracks severity per window key", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "warning");
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);

      // Different key is independent
      expect(notifier.shouldNotify("Requests / 5h", "warning")).toBe(true);
    });

    it("suppresses repeat high after downgrade-and-re-escalation within cooldown", () => {
      // Scenario: high → warning (downgrade, suppressed) → high again.
      // Because the state was never re-notified at warning, a same-severity
      // high check is still within cooldown and should not re-fire.
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Test", "high");
      expect(notifier.shouldNotify("Test", "warning")).toBe(false);
      expect(notifier.shouldNotify("Test", "high")).toBe(false);

      // After cooldown, repeating the same severity re-notifies.
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      expect(notifier.shouldNotify("Test", "high")).toBe(true);
    });
  });

  describe("clearAlertState", () => {
    it("resets all alert state so windows notify again", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "warning");
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);

      notifier.clearAlertState();

      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(true);
    });
  });

  describe("findHighRiskWindows", () => {
    it("returns empty for low-usage quotas", () => {
      const notifier = new QuotaWarningNotifier();
      const risks = notifier.findHighRiskWindows(baseQuotas);
      expect(risks).toHaveLength(0);
    });

    it("finds windows with high usage", () => {
      const notifier = new QuotaWarningNotifier();
      const quotas: QuotasResponse = {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining: 5,
          max: 100,
          limited: false,
        },
      };
      const risks = notifier.findHighRiskWindows(quotas);
      const fiveHourRisk = risks.find(
        (r) => r.window.label === "Requests / 5h",
      );
      assert(fiveHourRisk, "fiveHourRisk should exist");
      expect(fiveHourRisk.assessment.severity).toBe("high");
    });

    it("finds limited windows even with low usage", () => {
      const notifier = new QuotaWarningNotifier();
      const quotas: QuotasResponse = {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining: 95,
          max: 100,
          limited: true,
        },
      };
      const risks = notifier.findHighRiskWindows(quotas);
      const fiveHourRisk = risks.find(
        (r) => r.window.label === "Requests / 5h",
      );
      assert(fiveHourRisk, "fiveHourRisk should exist");
      expect(fiveHourRisk.assessment.severity).toBe("critical");
    });

    it("returns empty for quotas with no windows", () => {
      const notifier = new QuotaWarningNotifier();
      expect(notifier.findHighRiskWindows({})).toHaveLength(0);
    });
  });

  describe("formatWarningMessage", () => {
    it("formats single window warning", () => {
      const notifier = new QuotaWarningNotifier();
      const w: QuotaWindow = {
        id: "rollingFiveHourLimit",
        label: "Requests / 5h",
        usedPercent: 92,
        resetsAt: new Date(Date.now() + 2 * 3600 * 1000),
        windowSeconds: 5 * 3600,
        usedValue: 92,
        limitValue: 100,
        showPace: false,
      };
      const assessment = assessWindow(w);
      const msg = notifier.formatWarningMessage([{ window: w, assessment }]);
      expect(msg).toContain("Synthetic quota warning:");
      expect(msg).toContain("Requests / 5h");
      expect(msg).toContain("92% used");
      expect(msg).toContain("projected");
    });

    it("formats multiple windows", () => {
      const notifier = new QuotaWarningNotifier();
      const w1: QuotaWindow = {
        id: "weeklyTokenLimit",
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
        id: "rollingFiveHourLimit",
        label: "Requests / 5h",
        usedPercent: 92,
        resetsAt: new Date(Date.now() + 2 * 3600 * 1000),
        windowSeconds: 5 * 3600,
        usedValue: 92,
        limitValue: 100,
        showPace: false,
      };
      const msg = notifier.formatWarningMessage([
        { window: w1, assessment: assessWindow(w1) },
        { window: w2, assessment: assessWindow(w2) },
      ]);
      expect(msg).toContain("Credits / week");
      expect(msg).toContain("Requests / 5h");
      const lines = msg.split("\n");
      expect(lines).toHaveLength(3); // header + 2 windows
    });

    it("includes severity label for non-none severities", () => {
      const notifier = new QuotaWarningNotifier();
      const w: QuotaWindow = {
        id: "rollingFiveHourLimit",
        label: "Requests / 5h",
        usedPercent: 92,
        resetsAt: new Date(Date.now() + 2 * 3600 * 1000),
        windowSeconds: 5 * 3600,
        usedValue: 92,
        limitValue: 100,
        showPace: false,
      };
      const msg = notifier.formatWarningMessage([
        { window: w, assessment: assessWindow(w) },
      ]);
      expect(msg).toMatch(/\(high\)/);
    });
  });

  describe("evaluate", () => {
    it("does not notify for low-usage quotas", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);

      notifier.evaluate(baseQuotas, false, notify);
      expect(calls).toHaveLength(0);
    });

    it("notifies for high-usage quotas with skipAlreadyWarned=false", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);

      const highUsageQuotas: QuotasResponse = {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining: 5,
          max: 100,
          limited: false,
        },
      };

      notifier.evaluate(highUsageQuotas, false, notify);
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("Synthetic quota warning");
    });

    it("does not re-notify on same severity with skipAlreadyWarned=true", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);

      // 85% used (no pace) → warning severity, which has cooldown
      const warningQuotas: QuotasResponse = {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining: 15,
          max: 100,
          limited: false,
        },
      };

      notifier.evaluate(warningQuotas, true, notify);
      expect(calls).toHaveLength(1);

      // Same severity, same data — should not re-notify (warning has cooldown)
      notifier.evaluate(warningQuotas, true, notify);
      expect(calls).toHaveLength(1);
    });

    it("notifies on severity escalation even with skipAlreadyWarned=true", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);

      // 92% used (no pace) → high severity
      const highQuotas: QuotasResponse = {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining: 8,
          max: 100,
          limited: false,
        },
      };

      notifier.evaluate(highQuotas, true, notify);
      expect(calls).toHaveLength(1);

      // Same severity re-evaluated within cooldown: suppressed (over-firing bug).
      notifier.evaluate(highQuotas, true, notify);
      expect(calls).toHaveLength(1);

      // Escalate to critical (limited): bypasses cooldown, fires again.
      const criticalQuotas: QuotasResponse = {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining: 2,
          max: 100,
          limited: true,
        },
      };

      notifier.evaluate(criticalQuotas, true, notify);
      expect(calls).toHaveLength(2);
      expect(calls[1][1]).toBe("error");
    });
  });

  describe("evaluate with refill-aware projections", () => {
    const FIVE_HOUR_ID = "rollingFiveHourLimit";

    function quotasAt(usedPercent: number): QuotasResponse {
      const max = 100;
      const remaining = max - Math.round((usedPercent / 100) * max);
      return {
        ...baseQuotas,
        rollingFiveHourLimit: {
          nextTickAt: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
          tickPercent: 0.05,
          remaining,
          max,
          limited: false,
        },
      };
    }

    it("suppresses the imminent-tick bounce (raw high, projection none)", () => {
      // Raw 92% used would be `high`, but the refill-aware projection says the
      // quota is recovering -> severity none -> no notification.
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);
      const projections = new Map<string, ProjectionHint>([
        [FIVE_HOUR_ID, { kind: "stable" }],
      ]);

      notifier.evaluate(quotasAt(92), false, notify, projections);
      expect(calls).toHaveLength(0);
    });

    it("does not warn when projected usage drops below the threshold", () => {
      // Raw 82% would warn, but the projection says usage will be 79% -> none.
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);
      const projections = new Map<string, ProjectionHint>([
        [
          FIVE_HOUR_ID,
          { kind: "projected", usedPercent: 79, horizonMs: 3600_000 },
        ],
      ]);

      notifier.evaluate(quotasAt(82), false, notify, projections);
      expect(calls).toHaveLength(0);
    });

    it("warns when projected usage exceeds the warning threshold", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);
      const projections = new Map<string, ProjectionHint>([
        [
          FIVE_HOUR_ID,
          { kind: "projected", usedPercent: 86, horizonMs: 3600_000 },
        ],
      ]);

      notifier.evaluate(quotasAt(82), false, notify, projections);
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain("Requests / 5h");
    });

    it("escalates to critical when projected usage saturates", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);
      const projections = new Map<string, ProjectionHint>([
        [
          FIVE_HOUR_ID,
          { kind: "projected", usedPercent: 100, horizonMs: 3600_000 },
        ],
      ]);

      notifier.evaluate(quotasAt(82), false, notify, projections);
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toBe("error");
    });

    it("falls back to raw thresholds when no projection is supplied", () => {
      const notifier = new QuotaWarningNotifier();
      const calls: Array<[string, string]> = [];
      const notify: NotifyFn = (msg, lvl) => calls.push([msg, lvl]);

      // No projections map -> raw 92% -> high -> notified.
      notifier.evaluate(quotasAt(92), false, notify);
      expect(calls).toHaveLength(1);
    });
  });

  describe("notification flow (shouldNotify + markNotified integration)", () => {
    it("notifies once on first warning, blocks repeat, notifies on escalation", () => {
      const notifier = new QuotaWarningNotifier();
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(true);
      notifier.markNotified("Credits / week", "warning");

      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);

      expect(notifier.shouldNotify("Credits / week", "high")).toBe(true);
      notifier.markNotified("Credits / week", "high");

      // Same severity within cooldown is suppressed (the over-firing bug).
      expect(notifier.shouldNotify("Credits / week", "high")).toBe(false);
    });

    it("allows re-notification after clear", () => {
      const notifier = new QuotaWarningNotifier();
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(true);
      notifier.markNotified("Credits / week", "warning");
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);

      notifier.clearAlertState();

      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(true);
    });

    it("tracks windows independently", () => {
      const notifier = new QuotaWarningNotifier();
      notifier.markNotified("Credits / week", "warning");
      expect(notifier.shouldNotify("Credits / week", "warning")).toBe(false);
      expect(notifier.shouldNotify("Search / hour", "warning")).toBe(true);
    });
  });
});
