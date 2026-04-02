import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import {
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
}

function toWindows(quotas: QuotasResponse): QuotaWindow[] {
  const windows: QuotaWindow[] = [];

  if (quotas.subscription.limit > 0) {
    windows.push({
      label: "Completions",
      usedPercent:
        (quotas.subscription.requests / quotas.subscription.limit) * 100,
      resetsAt: new Date(quotas.subscription.renewsAt),
      windowSeconds: 5 * 60 * 60,
      usedValue: quotas.subscription.requests,
      limitValue: quotas.subscription.limit,
    });
  }

  if (quotas.search.hourly.limit > 0) {
    windows.push({
      label: "Search",
      usedPercent:
        (quotas.search.hourly.requests / quotas.search.hourly.limit) * 100,
      resetsAt: new Date(quotas.search.hourly.renewsAt),
      windowSeconds: 60 * 60,
      usedValue: quotas.search.hourly.requests,
      limitValue: quotas.search.hourly.limit,
    });
  }

  if (quotas.freeToolCalls.limit > 0) {
    windows.push({
      label: "Free Tool Calls",
      usedPercent:
        (quotas.freeToolCalls.requests / quotas.freeToolCalls.limit) * 100,
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

export class QuotasComponent implements Component {
  private state: QuotasState = { type: "loading" };
  private theme: Theme;
  private onClose: () => void;

  constructor(theme: Theme, onClose: () => void) {
    this.theme = theme;
    this.onClose = onClose;
  }

  setState(state: QuotasState): void {
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
        lines.push(this.theme.fg("muted", "  Loading..."));
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

    // Progress bar + usage
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

    // Metadata: estimated + pace left, reset time right
    const leftParts: string[] = [];
    if (projectedPercent > 0) {
      const estStr = `est ${Math.round(projectedPercent)}%`;
      leftParts.push(
        severity !== "success"
          ? theme.fg(severity, estStr)
          : theme.fg("dim", estStr),
      );
    }

    if (pacePercent !== null) {
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
