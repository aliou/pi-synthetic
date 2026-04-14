import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { Loader, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { QuotasResponse } from "../../../types/quotas";
import {
  assessWindow,
  formatTimeRemaining,
  getSeverityColor,
  type QuotaWindow,
  toWindows,
} from "../../../utils/quotas-severity";

type QuotasState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "loaded"; quotas: QuotasResponse };

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
  private onRefetch: () => void;
  private loader: Loader | null = null;

  constructor(
    theme: Theme,
    tui: TUI,
    onClose: () => void,
    onRefetch: () => void,
  ) {
    this.theme = theme;
    this.tui = tui;
    this.onClose = onClose;
    this.onRefetch = onRefetch;
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
    if (state.type === "loading") {
      this.loader?.stop();
      this.startLoader();
    } else if (this.state.type === "loading") {
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
    if (data === "r") {
      this.onRefetch();
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
    lines.push(this.theme.fg("dim", "  r to refresh  q/Esc to close"));
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

    const assessment = assessWindow(window);
    const color = getSeverityColor(assessment.severity);

    // Label
    lines.push(
      truncateToWidth(`  ${theme.fg("accent", window.label)}`, maxWidth),
    );

    // Bar + usage
    const bar = renderProgressBar(
      window.usedPercent,
      barWidth,
      theme,
      color,
      assessment.pacePercent,
    );
    const usedStr = window.isCurrency
      ? `${Math.round(window.usedPercent)}%/$${window.limitValue.toFixed(2)}`
      : `${Math.round(window.usedPercent)}%/${window.limitValue}`;
    const limitedBadge = window.limited ? theme.fg("error", " LIMITED") : "";
    lines.push(
      truncateToWidth(
        `  ${bar} ${theme.fg(color, usedStr)}${limitedBadge}`,
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
