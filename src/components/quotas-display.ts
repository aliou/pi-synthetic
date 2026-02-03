import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { type Component, Container, Text } from "@mariozechner/pi-tui";
import type { QuotasResponse } from "../types/quotas";

export class QuotasDisplayComponent implements Component {
  private container: Container;

  constructor(theme: Theme, quotas: QuotasResponse) {
    this.container = new Container();
    const border = new DynamicBorder((s: string) => theme.fg("accent", s));

    this.container.addChild(border);
    this.container.addChild(
      new Text(theme.fg("accent", theme.bold(" Synthetic API Quotas ")), 1, 0),
    );
    this.container.addChild(new Text("", 0, 0));

    const remaining = quotas.subscription.limit - quotas.subscription.requests;
    const percentUsed = Math.round(
      (quotas.subscription.requests / quotas.subscription.limit) * 100,
    );

    // Usage bar: left side = used (colored by severity), right side = remaining (neutral)
    const barWidth = 40;
    const usedWidth = Math.round((percentUsed / 100) * barWidth);
    const remainingWidth = barWidth - usedWidth;

    let bar: string;
    if (usedWidth >= barWidth) {
      bar = theme.fg("error", "█".repeat(barWidth));
    } else if (percentUsed > 75) {
      // High usage: used is warning, remaining is dim
      bar =
        theme.fg("warning", "█".repeat(usedWidth)) +
        theme.fg("dim", "█".repeat(remainingWidth));
    } else {
      // Normal usage: used is success, remaining is dim
      bar =
        theme.fg("success", "█".repeat(usedWidth)) +
        theme.fg("dim", "█".repeat(remainingWidth));
    }

    this.container.addChild(new Text(`  ${theme.bold("Usage")}`, 1, 0));
    this.container.addChild(new Text(`  ${bar} ${percentUsed}%`, 1, 0));
    this.container.addChild(new Text("", 0, 0));

    // Numbers - aligned columns
    const limitStr = quotas.subscription.limit.toLocaleString();
    const usedStr = quotas.subscription.requests.toLocaleString();
    const remainingStr = remaining.toLocaleString();
    const maxValueWidth = Math.max(
      limitStr.length,
      usedStr.length,
      remainingStr.length,
    );

    this.container.addChild(
      new Text(
        `  ${theme.fg("muted", "Limit:")}     ${limitStr.padStart(maxValueWidth, " ")} requests`,
        1,
        0,
      ),
    );
    this.container.addChild(
      new Text(
        `  ${theme.fg("muted", "Used:")}      ${usedStr.padStart(maxValueWidth, " ")} requests`,
        1,
        0,
      ),
    );
    this.container.addChild(
      new Text(
        `  ${theme.fg("muted", "Remaining:")} ${theme.fg(
          remaining > 0 ? "success" : "error",
          remainingStr.padStart(maxValueWidth, " "),
        )} requests`,
        1,
        0,
      ),
    );
    this.container.addChild(new Text("", 0, 0));

    // Renewal date - ISO8601 with relative time
    const renewsAt = new Date(quotas.subscription.renewsAt);
    const isoStr = quotas.subscription.renewsAt;
    const relativeStr = formatRelativeTime(renewsAt);

    this.container.addChild(
      new Text(
        `  ${theme.fg("muted", "Renews:")}    ${isoStr} (${relativeStr})`,
        1,
        0,
      ),
    );

    this.container.addChild(new Text("", 0, 0));
    this.container.addChild(
      new Text(theme.fg("dim", "  Press any key to close"), 1, 0),
    );
    this.container.addChild(border);
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "renews soon";
  }

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMinutes = Math.ceil(diffMs / (1000 * 60));
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return rtf.format(diffMinutes, "minute");
  } else if (diffHours < 24) {
    return rtf.format(diffHours, "hour");
  } else if (diffDays < 30) {
    return rtf.format(diffDays, "day");
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return rtf.format(months, "month");
  } else {
    const years = Math.floor(diffDays / 365);
    return rtf.format(years, "year");
  }
}
