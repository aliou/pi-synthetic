import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

export interface PanelTab {
  label: string;
  buildContent: () => string[];
}

export interface TabbedScrollablePanelOptions {
  title: string;
  tabs: PanelTab[];
  onClose: () => void;
  maxVisible?: number;
  keymap?: "vim" | "default";
}

export class TabbedScrollablePanel implements Component {
  private activeTab = 0;
  private scrollOffset = 0;
  private cachedLines: string[] | null = null;
  private cachedWidth = 0;
  private border: DynamicBorder;
  private options: TabbedScrollablePanelOptions;
  private theme: Theme;

  constructor(options: TabbedScrollablePanelOptions, _tui: TUI, theme: Theme) {
    this.options = options;
    this.theme = theme;
    this.border = new DynamicBorder((segment) => theme.fg("border", segment));
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.options.onClose();
      return true;
    }

    if (matchesKey(data, "tab")) {
      this.activeTab = (this.activeTab + 1) % this.options.tabs.length;
      this.scrollOffset = 0;
      this.invalidate();
      return true;
    }

    if (matchesKey(data, "shift+tab")) {
      this.activeTab =
        (this.activeTab - 1 + this.options.tabs.length) %
        this.options.tabs.length;
      this.scrollOffset = 0;
      this.invalidate();
      return true;
    }

    const maxVisible = this.options.maxVisible ?? 16;
    const totalLines = this.cachedLines?.length ?? 0;
    const maxScroll = Math.max(0, totalLines - maxVisible);

    if (data === "j" || matchesKey(data, "down")) {
      if (this.scrollOffset < maxScroll) {
        this.scrollOffset++;
      }
      return true;
    }

    if (data === "k" || matchesKey(data, "up")) {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
      }
      return true;
    }

    if (data === " " || matchesKey(data, "pageDown")) {
      this.scrollOffset = Math.min(this.scrollOffset + maxVisible, maxScroll);
      return true;
    }

    if (matchesKey(data, "pageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - maxVisible);
      return true;
    }

    if (matchesKey(data, "home")) {
      this.scrollOffset = 0;
      return true;
    }

    if (matchesKey(data, "end")) {
      this.scrollOffset = maxScroll;
      return true;
    }

    return false;
  }

  invalidate(): void {
    this.cachedLines = null;
    this.cachedWidth = 0;
  }

  render(width: number): string[] {
    const tab = this.options.tabs[this.activeTab];

    if (!this.cachedLines || this.cachedWidth !== width) {
      this.cachedLines = tab ? tab.buildContent() : [];
      this.cachedWidth = width;
    }

    const lines: string[] = [];

    lines.push(...this.border.render(width));
    lines.push(
      truncateToWidth(
        ` ${this.theme.fg("accent", this.theme.bold(this.options.title))}`,
        width,
      ),
    );
    lines.push(this.renderTabBar(width));
    lines.push("");

    // Content - no forced padding, just render what we have
    for (const line of this.cachedLines) {
      lines.push(truncateToWidth(`  ${line}`, width));
    }

    // Footer directly after content
    lines.push("");
    lines.push(
      truncateToWidth(
        this.theme.fg("dim", "  Tab/S-Tab switch tabs  q/Esc close"),
        width,
      ),
    );
    lines.push(...this.border.render(width));

    return lines;
  }

  private renderTabBar(width: number): string {
    const parts: string[] = [];

    for (let i = 0; i < this.options.tabs.length; i++) {
      const tab = this.options.tabs[i];
      if (!tab) continue;
      const active = i === this.activeTab;

      if (active) {
        parts.push(this.theme.fg("accent", this.theme.bold(` ${tab.label} `)));
      } else {
        parts.push(this.theme.fg("dim", ` ${tab.label} `));
      }

      if (i < this.options.tabs.length - 1) {
        parts.push(this.theme.fg("borderMuted", "│"));
      }
    }

    return truncateToWidth(`  ${parts.join("")}`, width);
  }
}
