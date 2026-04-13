import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { Loader, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { QuotasResponse } from "../../../types/quotas";

type QuotasState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "loaded"; quotas: QuotasResponse };

interface QuotaWindow {
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

/** Safely compute percentage, guarding against division by zero */
function safePercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

/** Parse currency string like "$1,234.56" to number */
function parseCurrency(value: string): number {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toWindows(quotas: QuotasResponse): QuotaWindow[] {
  const windows: QuotaWindow[] = [];

  if (quotas.weeklyTokenLimit) {
    const { weeklyTokenLimit } = quotas;
    const limitValue = parseCurrency(weeklyTokenLimit.maxCredits);
    const remainingValue = parseCurrency(weeklyTokenLimit.remainingCredits);
    windows.push({
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
      showPace: true,
      paceScale: 1 / 7,
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

function getPacePercent(window: QuotaWindow): number | null {
  const totalMs = window.windowSeconds * 1000;
  if (totalMs <= 0) return null;
  const remainingMs = window.resetsAt.getTime() - Date.now();
  const elapsedMs = totalMs - remainingMs;
  return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
}

function getProjectedPercent(
  usedPercent: number,
  pacePercent: number | null,
): number {
  if (pacePercent === null) return usedPercent;
  const effectivePace = Math.max(5, pacePercent);
  return Math.max(0, (usedPercent / effectivePace) * 100);
}

function getSeverity(
  projectedPercent: number,
  pacePercent: number | null,
): "success" | "warning" | "error" {
  if (pacePercent === null) {
    if (projectedPercent >= 100) return "error";
    if (projectedPercent >= 90) return "warning";
    return "success";
  }
  // Dynamic thresholds based on window progress
  const progress = pacePercent / 100;
  const warnThreshold = 260 - (260 - 120) * progress;
  const highThreshold = 320 - (320 - 145) * progress;
  const criticalThreshold = 400 - (400 - 170) * progress;

  if (projectedPercent >= criticalThreshold) return "error";
  if (projectedPercent >= highThreshold) return "error";
  if (projectedPercent >= warnThreshold) return "warning";
  return "success";
}

function formatTimeRemaining(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMins = Math.ceil(ms / (1000 * 60));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 1) return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  const totalSecs = Math.ceil(ms / 1000);
  return totalMins >= 1 ? `${totalMins}m` : `${totalSecs}s`;
}

/**
 * Convert a foreground ANSI escape to its background equivalent.
 * Handles truecolor (38;2), 256-color (38;5), and basic (3X) escapes.
 */
function fgAnsiToBg(fgAnsi: string): string {
  // Convert fg escape sequences to bg equivalents by replacing the
  // discriminating digit: 38 (truecolor/256) → 48, 3X (basic) → 4X.
  return fgAnsi
    .split("[38;")
    .join("[48;")
    .replace(/\[3([0-9])m/g, "[4$1m");
}

function renderProgressBar(
  percent: number,
  width: number,
  theme: Theme,
  fillColor: "success" | "warning" | "error",
  pacePercent?: number | null,
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);

  const showPace =
    pacePercent !== null &&
    pacePercent !== undefined &&
    pacePercent >= 5 &&
    Math.abs(pacePercent - percent) >= 5;
  const paceIndex = showPace
    ? Math.min(
        width - 1,
        Math.round(
          (Math.max(0, Math.min(100, pacePercent ?? 0)) / 100) * width,
        ),
      )
    : null;

  const reset = "\x1b[0m";

  const parts: string[] = [];
  for (let idx = 0; idx < width; idx++) {
    if (paceIndex !== null && idx === paceIndex) {
      // Inside fill = ahead of pace: accent. Outside = behind pace: severity.
      const markerColor = idx < filled ? "accent" : fillColor;
      // Inside fill: set bg to fill color so `|` doesn't expose the panel bg
      // through the thin character. Outside fill: ░ uses terminal bg naturally,
      // so leave bg unset to match.
      if (idx < filled) {
        const bgAnsi = fgAnsiToBg(theme.getFgAnsi(fillColor));
        const fgAnsi = theme.getFgAnsi(markerColor);
        parts.push(`${bgAnsi}${fgAnsi}|${reset}`);
      } else {
        parts.push(theme.fg(markerColor, "|"));
      }
    } else if (idx < filled) {
      parts.push(theme.fg(fillColor, "█"));
    } else {
      parts.push(theme.fg("dim", "░"));
    }
  }

  return parts.join("");
}

export class QuotasComponent implements Component {
  private state: QuotasState = { type: "loading" };
  private theme: Theme;
  private tui: TUI;
  private onClose: () => void;
  private loader: Loader | null = null;

  constructor(theme: Theme, tui: TUI, onClose: () => void) {
    this.theme = theme;
    this.tui = tui;
    this.onClose = onClose;
    this.startLoader();
  }

  private startLoader(): void {
    this.loader = new Loader(
      this.tui,
      (s: string) => this.theme.fg("accent", s),
      (s: string) => this.theme.fg("muted", s),
      "Fetching quotas...",
    );
  }

  destroy(): void {
    this.loader?.stop();
    this.loader = null;
  }

  setState(state: QuotasState): void {
    if (this.state.type === "loading" && state.type !== "loading") {
      this.loader?.stop();
      this.loader = null;
    }
    this.state = state;
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return true;
    }
    return false;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const border = new DynamicBorder((s: string) => this.theme.fg("border", s));
    const contentWidth = Math.max(1, width - 4);

    lines.push(...border.render(width));
    lines.push(
      truncateToWidth(
        ` ${this.theme.fg("accent", this.theme.bold("Synthetic API Quotas"))}`,
        width,
      ),
    );
    lines.push("");

    switch (this.state.type) {
      case "loading":
        if (this.loader) {
          lines.push(...this.loader.render(width));
        } else {
          lines.push(this.theme.fg("muted", "  Fetching quotas..."));
        }
        break;
      case "error":
        lines.push(this.theme.fg("error", `  ${this.state.message}`));
        break;
      case "loaded":
        lines.push(
          ...this.renderLoaded(this.state.quotas, contentWidth, width),
        );
        break;
    }

    lines.push("");
    lines.push(this.theme.fg("dim", "  q/Esc to close"));
    lines.push(...border.render(width));

    return lines;
  }

  private renderLoaded(
    quotas: QuotasResponse,
    contentWidth: number,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    const windows = toWindows(quotas);
    const barWidth = Math.min(50, Math.max(20, contentWidth - 20));

    for (const window of windows) {
      lines.push(...this.renderWindow(window, barWidth, maxWidth));
      lines.push("");
    }

    // Remove trailing empty line
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines;
  }

  private renderWindow(
    window: QuotaWindow,
    barWidth: number,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    const theme = this.theme;

    const rawPace = window.showPace ? getPacePercent(window) : null;
    const pacePercent =
      rawPace !== null ? rawPace * (window.paceScale ?? 1) : null;
    const projectedPercent = getProjectedPercent(
      window.usedPercent,
      pacePercent,
    );
    let severity = getSeverity(projectedPercent, pacePercent);
    if (window.limited) severity = "error";

    // Label
    lines.push(
      truncateToWidth(`  ${theme.fg("accent", window.label)}`, maxWidth),
    );

    // Bar + usage
    const bar = renderProgressBar(
      window.usedPercent,
      barWidth,
      theme,
      severity,
      pacePercent,
    );
    const usedStr = window.isCurrency
      ? `${Math.round(window.usedPercent)}%/$${window.limitValue.toFixed(2)}`
      : `${Math.round(window.usedPercent)}%/${window.limitValue}`;
    const limitedBadge = window.limited ? theme.fg("error", " LIMITED") : "";
    lines.push(
      truncateToWidth(
        `  ${bar} ${theme.fg(severity, usedStr)}${limitedBadge}`,
        maxWidth,
      ),
    );

    // Subtitle: next event info
    if (window.nextLabel) {
      const timeStr = formatTimeRemaining(window.resetsAt);
      const subtitleStr = window.nextAmount
        ? `${window.nextAmount} in ${timeStr}`
        : `${window.nextLabel} in ${timeStr}`;
      lines.push(
        truncateToWidth(`  ${theme.fg("dim", subtitleStr)}`, maxWidth),
      );
    }

    return lines;
  }

  invalidate(): void {
    // No internal cached state to invalidate
  }
}
