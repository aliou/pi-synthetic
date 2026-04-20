import type { QuotasResponse } from "../types/quotas";
import {
  assessWindow,
  formatTimeRemaining,
  type QuotaWindow,
  type RiskAssessment,
  type RiskSeverity,
  toWindows,
} from "../utils/quotas-severity";

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

export interface WindowAlertState {
  lastSeverity: RiskSeverity;
  lastNotifiedAt: number; // epoch ms
}

interface WindowRisk {
  window: QuotaWindow;
  assessment: RiskAssessment;
}

export type NotifyFn = (message: string, level: "warning" | "error") => void;

/**
 * Pi-agnostic quota warning evaluator.
 *
 * Call `evaluate()` with a QuotasResponse and it decides whether
 * to fire a notification based on severity, escalation, and cooldown rules.
 *
 * Usage:
 *   const notifier = new QuotaWarningNotifier();
 *   notifier.evaluate(quotas, true, (msg, lvl) => ctx.ui.notify(msg, lvl));
 */
export class QuotaWarningNotifier {
  private windowAlerts = new Map<string, WindowAlertState>();

  /** Finds windows that exceed the risk threshold. */
  findHighRiskWindows(quotas: QuotasResponse): WindowRisk[] {
    const windows = toWindows(quotas);
    return windows
      .map((window) => ({ window, assessment: assessWindow(window) }))
      .filter((item) => item.assessment.severity !== "none");
  }

  /**
   * Determines if we should notify for this window based on cooldown
   * and severity rules.
   *
   * Rules:
   * - First time seeing this window at risk: notify
   * - Severity escalation (warning → high → critical): notify
   * - Cooldown elapsed (60 min) AND severity is "warning": notify
   * - High/Critical severity: always notify (no cooldown)
   */
  shouldNotify(windowKey: string, severity: RiskSeverity): boolean {
    const state = this.windowAlerts.get(windowKey);

    if (!state) return true;

    const severityOrder: RiskSeverity[] = [
      "none",
      "warning",
      "high",
      "critical",
    ];
    const currentIndex = severityOrder.indexOf(severity);
    const lastIndex = severityOrder.indexOf(state.lastSeverity);
    if (currentIndex > lastIndex) return true;

    if (severity === "high" || severity === "critical") return true;

    if (severity === "warning") {
      return Date.now() - state.lastNotifiedAt >= COOLDOWN_MS;
    }

    return false;
  }

  /** Updates alert state after notifying. */
  markNotified(windowKey: string, severity: RiskSeverity): void {
    this.windowAlerts.set(windowKey, {
      lastSeverity: severity,
      lastNotifiedAt: Date.now(),
    });
  }

  /** Formats the warning message for the notification. */
  formatWarningMessage(windows: WindowRisk[]): string {
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

  /** Clear all alert state. Call on session start, model change, or shutdown. */
  clearAlertState(): void {
    this.windowAlerts.clear();
  }

  /**
   * Evaluate a QuotasResponse and notify if thresholds are exceeded.
   *
   * @param quotas - The quota data to evaluate
   * @param skipAlreadyWarned - If true, only warn for windows not yet warned.
   *                            If false, warn for all high-usage windows.
   * @param notify - Callback to display the notification
   */
  evaluate(
    quotas: QuotasResponse,
    skipAlreadyWarned: boolean,
    notify: NotifyFn,
  ): void {
    const highRiskWindows = this.findHighRiskWindows(quotas);
    if (highRiskWindows.length === 0) return;

    const windowsToNotify = skipAlreadyWarned
      ? highRiskWindows.filter(({ window, assessment }) =>
          this.shouldNotify(window.label, assessment.severity),
        )
      : highRiskWindows;

    if (windowsToNotify.length === 0) return;

    for (const { window, assessment } of windowsToNotify) {
      this.markNotified(window.label, assessment.severity);
    }

    const message = this.formatWarningMessage(windowsToNotify);

    const hasCritical = windowsToNotify.some(
      ({ assessment }) => assessment.severity === "critical",
    );
    const hasHigh = windowsToNotify.some(
      ({ assessment }) => assessment.severity === "high",
    );
    const notifyLevel = hasCritical || hasHigh ? "error" : "warning";

    notify(message, notifyLevel);
  }
}
