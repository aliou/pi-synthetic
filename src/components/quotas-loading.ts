import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { type Component, Container, Text } from "@mariozechner/pi-tui";

export class QuotasLoadingComponent implements Component {
  private container: Container;

  constructor(theme: Theme) {
    this.container = new Container();
    const border = new DynamicBorder((s: string) => theme.fg("accent", s));

    this.container.addChild(border);
    this.container.addChild(
      new Text(theme.fg("accent", theme.bold(" Synthetic API Quotas ")), 1, 0),
    );
    this.container.addChild(new Text("", 0, 0));
    this.container.addChild(
      new Text(theme.fg("dim", "  Loading quotas..."), 1, 0),
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
