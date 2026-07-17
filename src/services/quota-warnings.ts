import type { ProjectionHint, QuotasResponse } from "../types/quotas";
import {
  assessWindow,
  formatTimeRemaining,
  type QuotaWindow,
  type RiskAssessment,
  type RiskSeverity,
  toWindows,
} from "../utils/quotas-severity";

export interface WindowAlertState {
  lastSeverity: RiskSeverity;
}

interface WindowRisk {
  window: QuotaWindow;
  assessment: RiskAssessment;
}

export type NotifyFn = (message: string, level: "warning" | "error") => void;

/**
 * Pi-agnostic quota warning evaluator.
 *
 * Call `evaluate()` with a QuotasResponse and it decides whether to notify on
 * a new risk or severity escalation.
 *
 * Usage:
 *   const notifier = new QuotaWarningNotifier();
 *   notifier.evaluate(quotas, (msg, lvl) => ctx.ui.notify(msg, lvl));
 */
export class QuotaWarningNotifier {
  private windowAlerts = new Map<string, WindowAlertState>();

  /** Finds windows that exceed the risk threshold.
   * @param projections - optional refill-aware projections keyed by window id. */
  findHighRiskWindows(
    quotas: QuotasResponse,
    projections?: Map<string, ProjectionHint>,
  ): WindowRisk[] {
    const windows = toWindows(quotas);
    return windows
      .map((window) => ({
        window,
        assessment: assessWindow(window, projections?.get(window.id)),
      }))
      .filter((item) => item.assessment.severity !== "none");
  }

  /**
   * Determines whether this observation is a new risk or an escalation.
   *
   * Rules:
   * - First time seeing this window at risk: notify.
   * - Severity escalation (warning → high → critical): notify.
   * - Same severity or downgrade: suppress.
   * - A recovered window is observed as `none`, so a later warning is a new
   *   transition and notifies again.
   */
  shouldNotify(windowKey: string, severity: RiskSeverity): boolean {
    const state = this.windowAlerts.get(windowKey);

    if (severity === "none") return false;
    if (!state) return true;

    // Escalation always notifies immediately (none → warning → high → critical).
    const severityOrder: RiskSeverity[] = [
      "none",
      "warning",
      "high",
      "critical",
    ];
    const currentIndex = severityOrder.indexOf(severity);
    const lastIndex = severityOrder.indexOf(state.lastSeverity);
    return currentIndex > lastIndex;
  }

  /** Records the latest observed severity, including recovery to `none`. */
  markObserved(windowKey: string, severity: RiskSeverity): void {
    this.windowAlerts.set(windowKey, { lastSeverity: severity });
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

  /** Clear all observed severity state. */
  clearAlertState(): void {
    this.windowAlerts.clear();
  }

  /**
   * Evaluate a QuotasResponse and notify if thresholds are exceeded.
   *
   * @param quotas - The quota data to evaluate
   * @param notify - Callback to display the notification
   * @param projections - Optional refill-aware projections keyed by window id,
   *   used to suppress imminent-tick threshold bounces and to surface on-pace
   *   drain for windows where pace is unavailable (e.g. the 5-hour window).
   */
  evaluate(
    quotas: QuotasResponse,
    notify: NotifyFn,
    projections?: Map<string, ProjectionHint>,
  ): void {
    const assessedWindows = toWindows(quotas).map((window) => ({
      window,
      assessment: assessWindow(window, projections?.get(window.id)),
    }));
    const windowsToNotify = assessedWindows.filter(
      ({ window, assessment }) =>
        assessment.severity !== "none" &&
        this.shouldNotify(window.id, assessment.severity),
    );

    for (const { window, assessment } of assessedWindows) {
      this.markObserved(window.id, assessment.severity);
    }

    if (windowsToNotify.length === 0) return;

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
