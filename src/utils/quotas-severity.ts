import type { ProjectionHint, QuotasResponse } from "../types/quotas";

export type RiskSeverity = "none" | "warning" | "high" | "critical";

export interface QuotaWindow {
  /** Stable quota id used to key projections (e.g. "rollingFiveHourLimit"). */
  id: string;
  label: string;
  usedPercent: number;
  resetsAt: Date;
  windowSeconds: number;
  usedValue: number;
  limitValue: number;
  isCurrency?: boolean;
  showPace?: boolean;
  paceScale?: number;
  limited?: boolean;
  nextAmount?: string;
  nextLabel?: string;
}

export interface WindowProjection {
  pacePercent: number | null;
  progress: number | null; // 0..1
  projectedPercent: number; // 0..+
  projectionHorizonMs: number | null;
  timeToEmptyMs: number | null;
  usedPercent: number;
}

export interface RiskAssessment extends WindowProjection {
  usedFloorPercent: number | null;
  warnProjectedPercent: number | null;
  highProjectedPercent: number | null;
  criticalProjectedPercent: number | null;
  severity: RiskSeverity;
}

const MIN_PACE_PERCENT = 5;

// Threshold interpolation points
// Early window (0% progress) -> Late window (100% progress)
const THRESHOLDS = {
  usedFloor: { start: 33, end: 8 },
  warnProjected: { start: 260, end: 120 },
  highProjected: { start: 320, end: 145 },
  criticalProjected: { start: 400, end: 170 },
};

function interpolate(start: number, end: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return start + (end - start) * clampedProgress;
}

/** Safely compute percentage, guarding against division by zero */
export function safePercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

/** Parse currency string like "$1,234.56" to number */
export function parseCurrency(value: string): number {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function toWindows(quotas: QuotasResponse): QuotaWindow[] {
  const windows: QuotaWindow[] = [];

  if (quotas.weeklyTokenLimit) {
    const { weeklyTokenLimit } = quotas;
    const limitValue = parseCurrency(weeklyTokenLimit.maxCredits);
    const remainingValue = parseCurrency(weeklyTokenLimit.remainingCredits);
    windows.push({
      id: "weeklyTokenLimit",
      label: "Credits / week",
      usedPercent: Math.max(
        0,
        Math.min(100, 100 - weeklyTokenLimit.percentRemaining),
      ),
      resetsAt: new Date(weeklyTokenLimit.nextRegenAt),
      windowSeconds: 24 * 60 * 60,
      usedValue: limitValue - remainingValue,
      limitValue,
      isCurrency: true,
      // nextRegenAt is the next daily credit refill, not the start/end of the
      // weekly window. History-based projections handle weekly pace.
      showPace: false,
      nextAmount: `+${weeklyTokenLimit.nextRegenCredits}`,
      nextLabel: "Next regen",
    });
  }

  if (quotas.rollingFiveHourLimit && quotas.rollingFiveHourLimit.max > 0) {
    const { rollingFiveHourLimit } = quotas;
    const used = rollingFiveHourLimit.max - rollingFiveHourLimit.remaining;
    const tickAmount =
      rollingFiveHourLimit.tickPercent * rollingFiveHourLimit.max;
    windows.push({
      id: "rollingFiveHourLimit",
      label: "Requests / 5h",
      usedPercent: safePercent(used, rollingFiveHourLimit.max),
      resetsAt: new Date(rollingFiveHourLimit.nextTickAt),
      windowSeconds: 5 * 60 * 60,
      usedValue: Math.round(used),
      limitValue: rollingFiveHourLimit.max,
      showPace: false,
      limited: rollingFiveHourLimit.limited,
      nextAmount: `+${tickAmount.toFixed(1)}`,
      nextLabel: "Next tick",
    });
  }

  if (quotas.search?.hourly?.limit && quotas.search.hourly.limit > 0) {
    const { hourly } = quotas.search;
    windows.push({
      id: "search.hourly",
      label: "Search / hour",
      usedPercent: safePercent(hourly.requests, hourly.limit),
      resetsAt: new Date(hourly.renewsAt),
      windowSeconds: 60 * 60,
      usedValue: hourly.requests,
      limitValue: hourly.limit,
      showPace: true,
      paceScale: 1,
      nextLabel: "Resets",
    });
  }

  if (quotas.freeToolCalls?.limit && quotas.freeToolCalls.limit > 0) {
    windows.push({
      id: "freeToolCalls",
      label: "Free Tool Calls / day",
      usedPercent: safePercent(
        quotas.freeToolCalls.requests,
        quotas.freeToolCalls.limit,
      ),
      resetsAt: new Date(quotas.freeToolCalls.renewsAt),
      windowSeconds: 24 * 60 * 60,
      usedValue: quotas.freeToolCalls.requests,
      limitValue: quotas.freeToolCalls.limit,
      showPace: true,
      paceScale: 1,
      nextLabel: "Resets",
    });
  }

  return windows;
}

export function getPacePercent(window: QuotaWindow): number | null {
  const totalMs = window.windowSeconds * 1000;
  if (totalMs <= 0) return null;
  const remainingMs = window.resetsAt.getTime() - Date.now();
  const elapsedMs = totalMs - remainingMs;
  return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
}

export function getProjectedPercent(
  usedPercent: number,
  pacePercent: number | null,
): number {
  if (pacePercent === null) return usedPercent;
  const effectivePace = Math.max(MIN_PACE_PERCENT, pacePercent);
  return Math.max(0, (usedPercent / effectivePace) * 100);
}

export function assessWindow(
  window: QuotaWindow,
  projection?: ProjectionHint,
): RiskAssessment {
  // Respect showPace/paceScale: only compute pace when the window opts in,
  // then apply any provider-specific normalization.
  const rawPace = window.showPace ? getPacePercent(window) : null;
  const pacePercent =
    rawPace !== null ? rawPace * (window.paceScale ?? 1) : null;
  const projectedPercent = getProjectedPercent(window.usedPercent, pacePercent);

  // Calculate progress (0 to 1) through the window
  let progress: number | null = null;
  if (pacePercent !== null) {
    progress = pacePercent / 100;
  }

  const base: WindowProjection = {
    pacePercent,
    progress,
    projectedPercent,
    projectionHorizonMs: null,
    timeToEmptyMs: null,
    usedPercent: window.usedPercent,
  };

  // Fallback when pace/progress unavailable: use static thresholds. For the
  // 5-hour window (and any other window where `resetsAt` is the next tick, not
  // a full rollover), a refill-aware `projection` adjusts the decision so an
  // imminent tick does not cause a false threshold bounce, and genuine on-pace
  // drain is still caught. When no projection is available (e.g. insufficient
  // history), raw `usedPercent` thresholds apply unchanged.
  if (progress === null) {
    let severity: RiskSeverity = "none";
    let effectiveProjected = projectedPercent;
    let projectionHorizonMs: number | null = null;
    let timeToEmptyMs: number | null = null;

    if (window.limited) {
      severity = "critical";
    } else if (projection) {
      if (projection.kind === "stable") {
        // Refilling at least as fast as burning: do not interrupt.
        severity = "none";
      } else {
        effectiveProjected = projection.usedPercent;
        projectionHorizonMs = projection.horizonMs;
        timeToEmptyMs = projection.timeToEmptyMs ?? null;
        if (effectiveProjected >= 100) severity = "critical";
        else if (effectiveProjected >= 90) severity = "high";
        else if (effectiveProjected >= 80) severity = "warning";
      }
    } else if (projectedPercent >= 100) {
      severity = "critical";
    } else if (projectedPercent >= 90) {
      severity = "high";
    } else if (projectedPercent >= 80) {
      severity = "warning";
    }

    return {
      ...base,
      projectedPercent: effectiveProjected,
      projectionHorizonMs,
      timeToEmptyMs,
      usedFloorPercent: null,
      warnProjectedPercent: 80,
      highProjectedPercent: 90,
      criticalProjectedPercent: 100,
      severity,
    };
  }

  // Dynamic thresholds based on window progress
  const usedFloorPercent = interpolate(
    THRESHOLDS.usedFloor.start,
    THRESHOLDS.usedFloor.end,
    progress,
  );
  const warnProjectedPercent = interpolate(
    THRESHOLDS.warnProjected.start,
    THRESHOLDS.warnProjected.end,
    progress,
  );
  const highProjectedPercent = interpolate(
    THRESHOLDS.highProjected.start,
    THRESHOLDS.highProjected.end,
    progress,
  );
  const criticalProjectedPercent = interpolate(
    THRESHOLDS.criticalProjected.start,
    THRESHOLDS.criticalProjected.end,
    progress,
  );

  // Determine severity (hard-limited windows are always critical)
  let severity: RiskSeverity = "none";
  if (window.limited) {
    severity = "critical";
  } else if (window.usedPercent >= usedFloorPercent) {
    if (projectedPercent >= criticalProjectedPercent) {
      severity = "critical";
    } else if (projectedPercent >= highProjectedPercent) {
      severity = "high";
    } else if (projectedPercent >= warnProjectedPercent) {
      severity = "warning";
    }
  }

  return {
    ...base,
    usedFloorPercent,
    warnProjectedPercent,
    highProjectedPercent,
    criticalProjectedPercent,
    severity,
  };
}

export function formatTimeRemaining(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMins = Math.ceil(ms / (1000 * 60));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 1) return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  const totalSecs = Math.ceil(ms / 1000);
  return totalMins >= 1 ? `${totalMins}m` : `${totalSecs}s`;
}

export function getSeverityColor(
  severity: RiskSeverity,
): "success" | "warning" | "error" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "warning":
      return "warning";
    default:
      return "success";
  }
}
