import type { ProjectionHint, QuotasResponse } from "../types/quotas";
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
   * Determines if we should notify for this window based on cooldown
   * and severity rules.
   *
   * Rules:
   * - First time seeing this window at risk: notify.
   * - Severity escalation (warning → high → critical): notify immediately,
   *   bypassing cooldown, so the user learns of a worsening situation.
   * - Same or lower severity within the cooldown (60 min): suppress. This
   *   keeps a persistent high/critical window from re-firing on every turn.
   * - Cooldown elapsed: notify again, to remind the user the risk persists.
   */
  shouldNotify(windowKey: string, severity: RiskSeverity): boolean {
    const state = this.windowAlerts.get(windowKey);

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
    if (currentIndex > lastIndex) return true;

    // Same severity or downgrade: respect the cooldown so a window sitting at
    // high/critical does not re-fire on every evaluation cycle (agent_end,
    // turn_end, model_select, ...). Escalation above still bypasses this.
    return Date.now() - state.lastNotifiedAt >= COOLDOWN_MS;
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
   * @param projections - Optional refill-aware projections keyed by window id,
   *   used to suppress imminent-tick threshold bounces and to surface on-pace
   *   drain for windows where pace is unavailable (e.g. the 5-hour window).
   */
  evaluate(
    quotas: QuotasResponse,
    skipAlreadyWarned: boolean,
    notify: NotifyFn,
    projections?: Map<string, ProjectionHint>,
  ): void {
    const highRiskWindows = this.findHighRiskWindows(quotas, projections);
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
