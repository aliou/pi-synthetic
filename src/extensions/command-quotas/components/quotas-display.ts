import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import {
  Loader,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";
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
  isCredits?: boolean;
  isLimited?: boolean;
  tickPercent?: number;
  nextRegenCredits?: string;
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

  // Weekly token limit (credits-based)
  if (quotas.weeklyTokenLimit) {
    const { weeklyTokenLimit } = quotas;
    const limitValue = parseCurrency(weeklyTokenLimit.maxCredits);
    const remainingValue = parseCurrency(weeklyTokenLimit.remainingCredits);
    windows.push({
      label: "Credits",
      usedPercent: Math.max(
        0,
        Math.min(100, 100 - weeklyTokenLimit.percentRemaining),
      ),
      resetsAt: new Date(weeklyTokenLimit.nextRegenAt),
      windowSeconds: 7 * 24 * 60 * 60,
      usedValue: limitValue - remainingValue,
      limitValue,
      isCredits: true,
      nextRegenCredits: weeklyTokenLimit.nextRegenCredits,
    });
  }

  // Rolling 5-hour limit (request-based)
  if (quotas.rollingFiveHourLimit && quotas.rollingFiveHourLimit.max > 0) {
    const { rollingFiveHourLimit } = quotas;
    windows.push({
      label: "5h",
      usedPercent: safePercent(
        rollingFiveHourLimit.max - rollingFiveHourLimit.remaining,
        rollingFiveHourLimit.max,
      ),
      resetsAt: new Date(rollingFiveHourLimit.nextTickAt),
      windowSeconds: 5 * 60 * 60,
      usedValue: rollingFiveHourLimit.max - rollingFiveHourLimit.remaining,
      limitValue: rollingFiveHourLimit.max,
      isLimited: rollingFiveHourLimit.limited,
      tickPercent: rollingFiveHourLimit.tickPercent,
    });
  }

  // Legacy subscription (fallback if rollingFiveHourLimit not available)
  if (
    !quotas.rollingFiveHourLimit &&
    quotas.subscription?.limit &&
    quotas.subscription.limit > 0
  ) {
    windows.push({
      label: "Completions",
      usedPercent: safePercent(
        quotas.subscription.requests,
        quotas.subscription.limit,
      ),
      resetsAt: new Date(quotas.subscription.renewsAt),
      windowSeconds: 5 * 60 * 60,
      usedValue: quotas.subscription.requests,
      limitValue: quotas.subscription.limit,
    });
  }

  if (quotas.search?.hourly?.limit && quotas.search.hourly.limit > 0) {
    windows.push({
      label: "Search",
      usedPercent: safePercent(
        quotas.search.hourly.requests,
        quotas.search.hourly.limit,
      ),
      resetsAt: new Date(quotas.search.hourly.renewsAt),
      windowSeconds: 60 * 60,
      usedValue: quotas.search.hourly.requests,
      limitValue: quotas.search.hourly.limit,
    });
  }

  if (quotas.freeToolCalls?.limit && quotas.freeToolCalls.limit > 0) {
    windows.push({
      label: "Free Tool Calls",
      usedPercent: safePercent(
        quotas.freeToolCalls.requests,
        quotas.freeToolCalls.limit,
      ),
      resetsAt: new Date(quotas.freeToolCalls.renewsAt),
      windowSeconds: 24 * 60 * 60,
      usedValue: quotas.freeToolCalls.requests,
      limitValue: quotas.freeToolCalls.limit,
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

function formatResetDateTime(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    return `today ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${dateStr} ${timeStr}`;
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
  const paceIndex =
    pacePercent === null || pacePercent === undefined || pacePercent <= percent
      ? null
      : Math.round((Math.max(0, Math.min(100, pacePercent)) / 100) * width);

  const parts: string[] = [];
  for (let idx = 0; idx < width; idx++) {
    if (idx < filled) {
      parts.push(theme.fg(fillColor, "█"));
    } else if (paceIndex !== null && idx < paceIndex) {
      parts.push(theme.fg(fillColor, "▓"));
    } else {
      parts.push(theme.fg("dim", "░"));
    }
  }

  return parts.join("");
}

function renderSimpleIndicatorBar(
  usedPercent: number,
  width: number,
  theme: Theme,
  severity: "success" | "warning" | "error",
): string {
  const clampedPercent = Math.max(0, Math.min(100, usedPercent));
  // Clamp to width - 1 to avoid off-by-one when usedPercent === 100
  const usedIndex = Math.min(
    Math.round((clampedPercent / 100) * width),
    width - 1,
  );
  const parts: string[] = [];

  // Hide marker when within 5% of edges
  const showMarker = clampedPercent >= 5 && clampedPercent <= 95;

  for (let idx = 0; idx < width; idx++) {
    if (showMarker && idx === usedIndex) {
      parts.push(theme.fg(severity, "|"));
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

    const pacePercent = getPacePercent(window);
    const projectedPercent = getProjectedPercent(
      window.usedPercent,
      pacePercent,
    );
    const severity = getSeverity(projectedPercent, pacePercent);

    // Label
    lines.push(
      truncateToWidth(`  ${theme.fg("accent", window.label)}`, maxWidth),
    );

    // Progress bar + usage (or indicator for new quota types)
    if (window.isCredits || window.tickPercent !== undefined) {
      // Show simple indicator bar for new quota types
      const bar = renderSimpleIndicatorBar(
        window.usedPercent,
        barWidth,
        theme,
        severity,
      );
      const usedStr = window.isCredits
        ? `$${window.usedValue.toFixed(2)}/$${window.limitValue.toFixed(2)} (${Math.round(window.usedPercent)}%)`
        : `${window.usedValue.toFixed(0)}/${window.limitValue.toFixed(0)} (${Math.round(window.usedPercent)}%)`;
      const limitedBadge = window.isLimited
        ? theme.fg("error", " LIMITED")
        : "";
      lines.push(
        truncateToWidth(
          `  ${bar} ${theme.fg(severity, usedStr)}${limitedBadge}`,
          maxWidth,
        ),
      );
    } else {
      // Traditional progress bar for legacy quota types
      const bar = renderProgressBar(
        window.usedPercent,
        barWidth,
        theme,
        severity,
        pacePercent,
      );
      const usedStr = `${window.usedValue.toLocaleString()}/${window.limitValue.toLocaleString()} (${Math.round(window.usedPercent)}%)`;
      lines.push(
        truncateToWidth(`  ${bar} ${theme.fg(severity, usedStr)}`, maxWidth),
      );
    }

    // Metadata: estimated + pace left, reset time right
    const leftParts: string[] = [];

    // Show tick info for rolling window
    if (window.tickPercent !== undefined) {
      const now = Date.now();
      const remainingMs = window.resetsAt.getTime() - now;
      const remainingMins = Math.ceil(remainingMs / (1000 * 60));
      const remainingSecs = Math.ceil(remainingMs / 1000);
      const timeStr =
        remainingMs <= 0
          ? "now"
          : remainingMins >= 1
            ? `${remainingMins}m`
            : `${remainingSecs}s`;
      const tickValue = (window.tickPercent / 100) * window.limitValue;
      const tickStr = `+${tickValue.toFixed(1)} in ${timeStr}`;
      leftParts.push(theme.fg("dim", tickStr));
    }

    // Show next regen credits for weekly token limit
    if (window.nextRegenCredits !== undefined) {
      const now = Date.now();
      const remainingMs = window.resetsAt.getTime() - now;
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      const remainingMins = Math.ceil(remainingMs / (1000 * 60));
      const timeStr =
        remainingMs <= 0
          ? "now"
          : remainingHours >= 1
            ? `${remainingHours}h`
            : `${remainingMins}m`;
      const regenStr = `+${window.nextRegenCredits} in ${timeStr}`;
      leftParts.push(theme.fg("dim", regenStr));
    }

    if (
      projectedPercent > 0 &&
      window.tickPercent === undefined &&
      window.nextRegenCredits === undefined
    ) {
      const estStr = `est ${Math.round(projectedPercent)}%`;
      leftParts.push(
        severity !== "success"
          ? theme.fg(severity, estStr)
          : theme.fg("dim", estStr),
      );
    }

    if (
      pacePercent !== null &&
      window.tickPercent === undefined &&
      window.nextRegenCredits === undefined
    ) {
      const paceDiff = window.usedPercent - pacePercent;
      if (Math.abs(paceDiff) > 5) {
        if (paceDiff > 0) {
          leftParts.push(
            theme.fg("warning", `${Math.round(Math.abs(paceDiff))}% ahead`),
          );
        } else {
          leftParts.push(
            theme.fg("success", `${Math.round(Math.abs(paceDiff))}% behind`),
          );
        }
      }
    }

    const leftStr = leftParts.join("  ");
    const resetStr = formatResetDateTime(window.resetsAt);
    const rightStr = theme.fg("dim", resetStr);

    const leftW = visibleWidth(leftStr);
    const rightW = visibleWidth(rightStr);
    const gap = Math.max(2, barWidth - leftW - rightW);

    lines.push(
      truncateToWidth(`  ${leftStr}${" ".repeat(gap)}${rightStr}`, maxWidth),
    );

    return lines;
  }

  invalidate(): void {
    // No internal cached state to invalidate
  }
}
