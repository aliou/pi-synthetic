import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import type { QuotasResponse } from "../../../types/quotas";
import { TabbedScrollablePanel } from "./tabbed-panel";

export class QuotasDisplayComponent implements Component {
  private panel: TabbedScrollablePanel;
  private onClose: () => void;

  constructor(theme: Theme, quotas: QuotasResponse, onClose: () => void) {
    this.onClose = onClose;

    this.panel = new TabbedScrollablePanel(
      {
        title: "Synthetic API Quotas",
        tabs: [
          {
            label: "Completions",
            buildContent: () =>
              buildHybridLayout(theme, quotas.subscription, 5), // 5-hour window
          },
          {
            label: "Search",
            buildContent: () =>
              buildHybridLayout(theme, quotas.search.hourly, 1), // 1 hour
          },
          {
            label: "Free tool call",
            buildContent: () =>
              buildToolCallsLayout(theme, quotas.freeToolCalls, 24), // 24 hours (daily)
          },
        ],
        onClose: onClose,
      },
      null as unknown as TUI,
      theme,
    );
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return true;
    }
    return this.panel.handleInput(data);
  }

  render(width: number): string[] {
    return this.panel.render(width);
  }

  invalidate(): void {
    this.panel.invalidate();
  }
}

// Layout: bar + pct/cur-total + pace/reset
function buildHybridLayout(
  theme: Theme,
  quota: { limit: number; requests: number; renewsAt: string },
  periodHours: number,
): string[] {
  const percentUsed = Math.round((quota.requests / quota.limit) * 100);
  const renewsAt = new Date(quota.renewsAt);
  const now = new Date();

  const lines: string[] = [];
  const barWidth = 50;

  const usedStr = quota.requests.toLocaleString();
  const limitStr = quota.limit.toLocaleString();

  // Color based on usage
  const usedColor =
    percentUsed >= 100 ? "error" : percentUsed > 75 ? "warning" : "success";

  // Calculate pace with known period
  const totalPeriod = periodHours * 60 * 60 * 1000;
  const timeUntilReset = Math.max(0, renewsAt.getTime() - now.getTime());
  const timeElapsed = totalPeriod - timeUntilReset;
  const percentTimeElapsed = (timeElapsed / totalPeriod) * 100;
  const paceDiff = percentUsed - percentTimeElapsed;

  let paceStr: string;
  let paceColor: "success" | "dim" | "error";
  if (paceDiff < -10) {
    paceStr = `${Math.round(Math.abs(paceDiff))}% behind pace`;
    paceColor = "success";
  } else if (paceDiff > 10) {
    paceStr = `${Math.round(paceDiff)}% ahead of pace`;
    paceColor = "error";
  } else {
    paceStr = "within pace";
    paceColor = "dim";
  }

  // Row above bar: pct left, cur/total right
  const pctStr = `${percentUsed}% used`;
  const totalDisplay = `${usedStr}/${limitStr}`;
  const spacing = " ".repeat(
    Math.max(1, barWidth - pctStr.length - totalDisplay.length),
  );
  lines.push(
    `  ${theme.fg(usedColor, pctStr)}${spacing}${theme.fg("dim", totalDisplay)}`,
  );

  // Bar
  const usedWidth = Math.round((percentUsed / 100) * barWidth);
  let bar: string;
  if (usedWidth >= barWidth) {
    bar = theme.fg("error", "█".repeat(barWidth));
  } else if (percentUsed > 75) {
    bar =
      theme.fg("warning", "█".repeat(usedWidth)) +
      theme.fg("dim", "█".repeat(barWidth - usedWidth));
  } else {
    bar =
      theme.fg("success", "█".repeat(usedWidth)) +
      theme.fg("dim", "█".repeat(barWidth - usedWidth));
  }
  lines.push(`  ${bar}`);

  // Row below bar: pace left, reset right
  const resetStr = formatShortTime(renewsAt);
  const paceSpacing = " ".repeat(
    Math.max(1, barWidth - paceStr.length - resetStr.length),
  );
  lines.push(
    `  ${theme.fg(paceColor, paceStr)}${paceSpacing}${theme.fg("dim", resetStr)}`,
  );

  return lines;
}

// Layout for free tool calls - shows remaining, not usage
function buildToolCallsLayout(
  theme: Theme,
  quota: { limit: number; requests: number; renewsAt: string },
  periodHours: number,
): string[] {
  const remaining = quota.limit - quota.requests;
  const percentRemaining = Math.round((remaining / quota.limit) * 100);
  const renewsAt = new Date(quota.renewsAt);
  const now = new Date();

  const lines: string[] = [];
  const barWidth = 50;

  const remainingStr = remaining.toLocaleString();

  // Color based on remaining (inverse of usage)
  const remainingColor =
    remaining <= 0 ? "error" : percentRemaining < 25 ? "warning" : "success";

  // Calculate pace (how fast you're consuming free calls)
  const totalPeriod = periodHours * 60 * 60 * 1000;
  const timeUntilReset = Math.max(0, renewsAt.getTime() - now.getTime());
  const timeElapsed = totalPeriod - timeUntilReset;
  const percentTimeElapsed = (timeElapsed / totalPeriod) * 100;
  const expectedRemaining = Math.round(
    quota.limit * (1 - percentTimeElapsed / 100),
  );
  const remainingDiff = remaining - expectedRemaining;

  let paceStr: string;
  let paceColor: "success" | "dim" | "error";
  if (remainingDiff > quota.limit * 0.1) {
    paceStr = `${remainingDiff.toLocaleString()} more than expected`;
    paceColor = "success";
  } else if (remainingDiff < -quota.limit * 0.1) {
    paceStr = `${Math.abs(remainingDiff).toLocaleString()} fewer than expected`;
    paceColor = "error";
  } else {
    paceStr = "on track";
    paceColor = "dim";
  }

  // Row above bar: pct remaining left, ratio right (like other tabs)
  const pctStr = `${percentRemaining}% remaining`;
  const ratioStr = `${remainingStr}/${quota.limit.toLocaleString()}`;
  const spacing = " ".repeat(
    Math.max(1, barWidth - pctStr.length - ratioStr.length),
  );
  lines.push(
    `  ${theme.fg(remainingColor, pctStr)}${spacing}${theme.fg("dim", ratioStr)}`,
  );

  // Bar (shows remaining, not used - so full bar = all remaining)
  const remainingWidth = Math.round((percentRemaining / 100) * barWidth);
  let bar: string;
  if (remaining <= 0) {
    bar = theme.fg("dim", "█".repeat(barWidth));
  } else if (percentRemaining < 25) {
    bar =
      theme.fg("warning", "█".repeat(remainingWidth)) +
      theme.fg("dim", "█".repeat(barWidth - remainingWidth));
  } else {
    bar =
      theme.fg("success", "█".repeat(remainingWidth)) +
      theme.fg("dim", "█".repeat(barWidth - remainingWidth));
  }
  lines.push(`  ${bar}`);

  // Row below bar: pace left, reset right
  const resetStr = formatShortTime(renewsAt);
  const paceSpacing = " ".repeat(
    Math.max(1, barWidth - paceStr.length - resetStr.length),
  );
  lines.push(
    `  ${theme.fg(paceColor, paceStr)}${paceSpacing}${theme.fg("dim", resetStr)}`,
  );

  // If depleted, show note about paid calls
  if (remaining <= 0) {
    lines.push(`  ${theme.fg("dim", "Additional calls will be charged")}`);
  }

  return lines;
}

function formatShortTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "soon";
  }

  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) {
    return `in ${diffHours}h`;
  } else if (diffDays < 7) {
    return `in ${diffDays}d`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}
