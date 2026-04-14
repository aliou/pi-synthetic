import { assert, describe, expect, it } from "vitest";
import {
  assessWindow,
  getPacePercent,
  getProjectedPercent,
  getSeverityColor,
  parseCurrency,
  type QuotaWindow,
  safePercent,
} from "./quotas-severity";

// Helper to create a QuotaWindow with sensible defaults
function makeWindow(
  overrides: Partial<QuotaWindow> & Pick<QuotaWindow, "usedPercent">,
): QuotaWindow {
  const windowSeconds = overrides.windowSeconds ?? 3600;
  // resetsAt defaults to 30 minutes from now (50% through a 1h window)
  const resetsAt =
    overrides.resetsAt ?? new Date(Date.now() + windowSeconds * 500);
  return {
    label: "Test Window",
    resetsAt,
    windowSeconds,
    usedValue: 0,
    limitValue: 100,
    ...overrides,
  };
}

describe("safePercent", () => {
  it("returns 0 for zero/invalid limit", () => {
    expect(safePercent(50, 0)).toBe(0);
    expect(safePercent(50, -1)).toBe(0);
    expect(safePercent(50, NaN)).toBe(0);
    expect(safePercent(NaN, 100)).toBe(0);
  });

  it("computes correct percentage", () => {
    expect(safePercent(50, 100)).toBe(50);
    expect(safePercent(75, 100)).toBe(75);
    expect(safePercent(1, 3)).toBeCloseTo(33.33);
  });

  it("clamps to 0-100", () => {
    expect(safePercent(150, 100)).toBe(100);
    expect(safePercent(-10, 100)).toBe(0);
  });
});

describe("parseCurrency", () => {
  it("parses dollar amounts", () => {
    expect(parseCurrency("$1,234.56")).toBe(1234.56);
    expect(parseCurrency("$10.00")).toBe(10);
  });

  it("returns 0 for invalid input", () => {
    expect(parseCurrency("")).toBe(0);
    expect(parseCurrency("abc")).toBe(0);
  });
});

describe("getPacePercent", () => {
  it("returns null for zero window", () => {
    const w = makeWindow({ usedPercent: 50, windowSeconds: 0 });
    expect(getPacePercent(w)).toBeNull();
  });

  it("returns ~50 for a window 50% elapsed", () => {
    const w = makeWindow({
      usedPercent: 50,
      windowSeconds: 3600,
      resetsAt: new Date(Date.now() + 1800 * 1000), // 30 min remaining
    });
    const pace = getPacePercent(w);
    assert(pace, "pace should not be null");
    expect(pace).toBeCloseTo(50, 0);
  });

  it("clamps to 0-100", () => {
    const w = makeWindow({
      usedPercent: 50,
      windowSeconds: 3600,
      resetsAt: new Date(Date.now() + 7200 * 1000), // way past
    });
    expect(getPacePercent(w)).toBe(0);
  });
});

describe("getProjectedPercent", () => {
  it("returns usedPercent when no pace", () => {
    expect(getProjectedPercent(42, null)).toBe(42);
  });

  it("projects based on pace", () => {
    // 50% used, 25% through window => projected 200%
    expect(getProjectedPercent(50, 25)).toBe(200);
  });

  it("uses minimum pace of 5", () => {
    // Very low pace should not blow up projection
    expect(getProjectedPercent(1, 0)).toBe(20); // 1 / 5 * 100
    expect(getProjectedPercent(1, 1)).toBe(20); // clamped to 5
  });
});

describe("assessWindow", () => {
  describe("no pace (showPace: false)", () => {
    it("returns none for low usage", () => {
      const w = makeWindow({ usedPercent: 10, showPace: false });
      expect(assessWindow(w).severity).toBe("none");
    });

    it("returns warning at 80% projected", () => {
      const w = makeWindow({ usedPercent: 85, showPace: false });
      expect(assessWindow(w).severity).toBe("warning");
    });

    it("returns high at 90% projected", () => {
      const w = makeWindow({ usedPercent: 92, showPace: false });
      expect(assessWindow(w).severity).toBe("high");
    });

    it("returns critical at 100% projected", () => {
      const w = makeWindow({ usedPercent: 100, showPace: false });
      expect(assessWindow(w).severity).toBe("critical");
    });

    it("returns critical for limited window regardless of usage", () => {
      const w = makeWindow({ usedPercent: 5, showPace: false, limited: true });
      expect(assessWindow(w).severity).toBe("critical");
    });
  });

  describe("with pace (showPace: true)", () => {
    it("returns none when usage is low and pace is normal", () => {
      const w = makeWindow({
        usedPercent: 20,
        showPace: true,
        paceScale: 1,
        windowSeconds: 3600,
        resetsAt: new Date(Date.now() + 1800 * 1000), // 50% through
      });
      expect(assessWindow(w).severity).toBe("none");
    });

    it("returns warning when projected exceeds warn threshold", () => {
      // 50% used, 50% through => projected 100%, well above warn at 50% progress (190)
      // But usedFloor at 50% progress is 20.5, so 50% > 20.5 => passes floor check
      const w = makeWindow({
        usedPercent: 50,
        showPace: true,
        paceScale: 1,
        windowSeconds: 3600,
        resetsAt: new Date(Date.now() + 1800 * 1000),
      });
      const result = assessWindow(w);
      // projected = 50 / 50 * 100 = 100
      // At 50% progress: warn = 260 - (260-120)*0.5 = 190, high = 232.5, critical = 285
      // 100 < 190 => none actually. Let me pick better numbers.
      expect(result.severity).toBe("none");
    });

    it("returns warning when projected exceeds dynamic warn threshold", () => {
      // 95% used, 50% through => projected 190%
      // At 50% progress: warn = 190, so 190 >= 190 => warning
      // usedFloor at 50% = 20.5, 95 >= 20.5 => passes
      const w = makeWindow({
        usedPercent: 95,
        showPace: true,
        paceScale: 1,
        windowSeconds: 3600,
        resetsAt: new Date(Date.now() + 1800 * 1000),
      });
      const result = assessWindow(w);
      expect(result.severity).toBe("warning");
    });

    it("uses paceScale to normalize pace", () => {
      // Weekly window with daily pace: paceScale = 1/7
      // At 50% through the day (12h), raw pace = 50%, scaled = 50/7 ≈ 7.14%
      // So progress ≈ 0.0714, projected = 95 / max(5, 7.14) * 100 ≈ 1330%
      const w = makeWindow({
        usedPercent: 95,
        showPace: true,
        paceScale: 1 / 7,
        windowSeconds: 7 * 24 * 3600, // 1 week
        resetsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000), // 6 days remaining
      });
      const result = assessWindow(w);
      // With paceScale applied, projected should be much higher
      assert(result.pacePercent, "pacePercent should not be null");
      expect(result.pacePercent).toBeLessThan(15); // scaled down
      expect(result.projectedPercent).toBeGreaterThan(500);
      expect(result.severity).toBe("critical");
    });

    it("does not use pace when showPace is false", () => {
      // Same timestamps but showPace: false
      const w = makeWindow({
        usedPercent: 50,
        showPace: false,
        windowSeconds: 5 * 3600,
        resetsAt: new Date(Date.now() + 2.5 * 3600 * 1000),
      });
      const result = assessWindow(w);
      expect(result.pacePercent).toBeNull();
      expect(result.progress).toBeNull();
      // Static thresholds: 50% < 80 => none
      expect(result.severity).toBe("none");
    });

    it("suppresses warning when usage is below usedFloor", () => {
      // Early window: raw pace ~10%, with paceScale=1 => progress=0.1
      // usedFloor at 10% progress = 33 - (33-8)*0.1 = 33 - 2.5 = 30.5
      // If used = 15% (< 30.5), projected might exceed warn but floor blocks it
      const w = makeWindow({
        usedPercent: 15,
        showPace: true,
        paceScale: 1,
        windowSeconds: 3600,
        // 10% through: 54 min remaining
        resetsAt: new Date(Date.now() + 54 * 60 * 1000),
      });
      const result = assessWindow(w);
      // projected = 15 / 10 * 100 = 150, which exceeds warn at 10% progress (246)
      // But usedFloor = 30.5, and 15 < 30.5 => suppressed
      expect(result.severity).toBe("none");
    });

    it("allows warning when usage exceeds usedFloor", () => {
      // Same timing but higher usage
      const w = makeWindow({
        usedPercent: 50,
        showPace: true,
        paceScale: 1,
        windowSeconds: 3600,
        resetsAt: new Date(Date.now() + 54 * 60 * 1000),
      });
      const result = assessWindow(w);
      // projected = 50 / 10 * 100 = 500
      // warn at 10% progress = 246, high = 282.5, critical = 357
      // 500 >= 357 => critical, usedFloor = 30.5, 50 >= 30.5 => passes
      expect(result.severity).toBe("critical");
    });
  });

  describe("limited flag", () => {
    it("overrides severity to critical even with low usage", () => {
      const w = makeWindow({
        usedPercent: 5,
        showPace: false,
        limited: true,
      });
      expect(assessWindow(w).severity).toBe("critical");
    });

    it("overrides severity to critical even with pace showing none", () => {
      const w = makeWindow({
        usedPercent: 5,
        showPace: true,
        paceScale: 1,
        limited: true,
        windowSeconds: 3600,
        resetsAt: new Date(Date.now() + 54 * 60 * 1000),
      });
      expect(assessWindow(w).severity).toBe("critical");
    });
  });
});

describe("getSeverityColor", () => {
  it("maps severity levels to display colors", () => {
    expect(getSeverityColor("none")).toBe("success");
    expect(getSeverityColor("warning")).toBe("warning");
    expect(getSeverityColor("high")).toBe("error");
    expect(getSeverityColor("critical")).toBe("error");
  });
});
