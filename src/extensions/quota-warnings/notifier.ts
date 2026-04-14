import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSyntheticApiKey } from "../../lib/env";
import type { QuotasResponse } from "../../types/quotas";
import { fetchQuotas } from "../../utils/quotas";
import {
  assessWindow,
  formatTimeRemaining,
  type QuotaWindow,
  type RiskAssessment,
  type RiskSeverity,
  toWindows,
} from "../../utils/quotas-severity";

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes
const MIN_FETCH_INTERVAL_MS = 30_000; // 30 seconds

export interface WindowAlertState {
  lastSeverity: RiskSeverity;
  lastNotifiedAt: number; // epoch ms
}

// Key format: "label" (e.g., "Credits / week", "Requests / 5h")
const windowAlerts = new Map<string, WindowAlertState>();

let lastFetchAt = 0;

interface WindowRisk {
  window: QuotaWindow;
  assessment: RiskAssessment;
}

/**
 * Finds windows that exceed the risk threshold.
 * Returns windows with their risk assessments.
 */
export function findHighRiskWindows(quotas: QuotasResponse): WindowRisk[] {
  const windows = toWindows(quotas);
  return windows
    .map((window) => ({ window, assessment: assessWindow(window) }))
    .filter((item) => item.assessment.severity !== "none");
}

/**
 * Determines if we should notify for this window based on cooldown and severity rules.
 * Rules:
 * - First time seeing this window at risk: notify
 * - Severity escalation (warning → high → critical): notify
 * - Cooldown elapsed (60 min) AND severity is "warning": notify
 * - High/Critical severity: always notify (no cooldown)
 */
export function shouldNotify(
  windowKey: string,
  severity: RiskSeverity,
): boolean {
  const state = windowAlerts.get(windowKey);

  if (!state) {
    // First time seeing this window at risk
    return true;
  }

  // Severity escalation always notifies
  const severityOrder: RiskSeverity[] = ["none", "warning", "high", "critical"];
  const currentIndex = severityOrder.indexOf(severity);
  const lastIndex = severityOrder.indexOf(state.lastSeverity);
  if (currentIndex > lastIndex) {
    return true;
  }

  // High and critical: no cooldown, always notify
  if (severity === "high" || severity === "critical") {
    return true;
  }

  // Warning: only notify if cooldown elapsed
  if (severity === "warning") {
    const elapsed = Date.now() - state.lastNotifiedAt;
    return elapsed >= COOLDOWN_MS;
  }

  return false;
}

/**
 * Updates alert state after notifying.
 */
export function markNotified(windowKey: string, severity: RiskSeverity): void {
  windowAlerts.set(windowKey, {
    lastSeverity: severity,
    lastNotifiedAt: Date.now(),
  });
}

/**
 * Formats the warning message for the notification.
 */
export function formatWarningMessage(windows: WindowRisk[]): string {
  const lines = windows.map(({ window, assessment }) => {
    const status = assessment.severity;
    const statusLabel = status !== "none" ? ` (${status})` : "";
    const projected = Math.round(assessment.projectedPercent);
    const used = Math.round(window.usedPercent);
    const timeStr = formatTimeRemaining(window.resetsAt);
    const eventStr = window.nextAmount
      ? `${window.nextAmount} in ${timeStr}`
      : `${window.nextLabel ?? "Resets"} in ${timeStr}`;
    return `- ${window.label}: ${used}% used, projected ${projected}%${statusLabel}, ${eventStr}`;
  });
  return `Synthetic quota warning:\n${lines.join("\n")}`;
}

/**
 * Clears the alert state and resets fetch tracking.
 * Call on session start, model change, or shutdown.
 */
export function clearAlertState(): void {
  windowAlerts.clear();
  lastFetchAt = 0;
}

/**
 * Checks quotas and shows a warning if above threshold.
 * This is fire-and-forget - does not block the caller.
 *
 * @param skipAlreadyWarned - If true, only warn for windows that haven't been warned yet.
 *                            If false, warn for all high usage windows (used on session start).
 */
export async function checkAndWarn(
  ctx: ExtensionContext,
  model: { provider: string; id: string } | undefined,
  skipAlreadyWarned: boolean,
): Promise<void> {
  if (!ctx.hasUI) return;
  if (model?.provider !== "synthetic") return;

  const apiKey = await getSyntheticApiKey(ctx.modelRegistry.authStorage);
  if (!apiKey) return;

  // Throttle: skip if fetched recently, unless skipAlreadyWarned is false
  // (session start / model change always fetches)
  const now = Date.now();
  if (skipAlreadyWarned && now - lastFetchAt < MIN_FETCH_INTERVAL_MS) {
    return;
  }

  lastFetchAt = now;

  try {
    const result = await fetchQuotas(apiKey);
    if (!result.success) return;

    const highRiskWindows = findHighRiskWindows(result.data.quotas);
    if (highRiskWindows.length === 0) return;

    // Filter to only windows that should be notified
    const windowsToNotify = skipAlreadyWarned
      ? highRiskWindows.filter(({ window, assessment }) => {
          return shouldNotify(window.label, assessment.severity);
        })
      : highRiskWindows;

    if (windowsToNotify.length === 0) return;

    // Mark only the windows that were actually notified
    for (const { window, assessment } of windowsToNotify) {
      markNotified(window.label, assessment.severity);
    }

    const message = formatWarningMessage(windowsToNotify);

    // Determine severity based on highest projected usage
    const hasCritical = windowsToNotify.some(
      ({ assessment }) => assessment.severity === "critical",
    );
    const hasHigh = windowsToNotify.some(
      ({ assessment }) => assessment.severity === "high",
    );
    const notifyLevel = hasCritical ? "error" : hasHigh ? "error" : "warning";

    ctx.ui.notify(message, notifyLevel);
  } catch {
    // Silently ignore errors
  }
}

/**
 * Fire-and-forget wrapper that ensures the check is non-blocking.
 *
 * @param skipAlreadyWarned - If true, only warn for windows that haven't been warned yet.
 */
export function triggerCheck(
  ctx: ExtensionContext,
  model: { provider: string; id: string } | undefined,
  skipAlreadyWarned: boolean,
): void {
  // Do not await - this is intentionally fire-and-forget
  checkAndWarn(ctx, model, skipAlreadyWarned).catch(() => {
    // Ignore errors
  });
}
