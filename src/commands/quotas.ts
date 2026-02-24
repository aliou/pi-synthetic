import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { QuotasDisplayComponent } from "../components/quotas-display";
import { QuotasErrorComponent } from "../components/quotas-error";
import { QuotasLoadingComponent } from "../components/quotas-loading";
import type { QuotasResponse } from "../types/quotas";

export function registerQuotasCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:quotas", {
    description: "Display Synthetic API usage quotas",
    handler: async (_args, ctx) => {
      const result = await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        let currentComponent: Component = new QuotasLoadingComponent(theme);

        fetchQuotas()
          .then((quotas) => {
            if (!quotas) {
              currentComponent = new QuotasErrorComponent(
                theme,
                "Failed to fetch quotas",
              );
            } else {
              currentComponent = new QuotasDisplayComponent(
                theme,
                quotas,
                () => {
                  done(null);
                },
              );
            }
            tui.requestRender();
          })
          .catch(() => {
            currentComponent = new QuotasErrorComponent(
              theme,
              "Failed to fetch quotas",
            );
            tui.requestRender();
          });

        return {
          render: (width: number) => currentComponent.render(width),
          invalidate: () => currentComponent.invalidate(),
          handleInput: (data: string) => {
            if (currentComponent.handleInput) {
              return currentComponent.handleInput(data);
            }
            done(null);
            return true;
          },
        };
      });

      // RPC fallback: custom() returned undefined
      if (result === undefined) {
        const quotas = await fetchQuotas();
        if (!quotas) {
          ctx.ui.notify("Failed to fetch quotas", "error");
          return;
        }
        ctx.ui.notify(formatQuotasPlain(quotas), "info");
      }
    },
  });
}

async function fetchQuotas(): Promise<QuotasResponse | null> {
  const apiKey = process.env.SYNTHETIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.synthetic.new/v2/quotas", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as QuotasResponse;
  } catch {
    return null;
  }
}

function formatQuotasPlain(quotas: QuotasResponse): string {
  const formatSection = (
    name: string,
    quota: { limit: number; requests: number; renewsAt: string },
  ) => {
    const remaining = quota.limit - quota.requests;
    const percentUsed = Math.round((quota.requests / quota.limit) * 100);
    return [
      `${name}:`,
      `Usage: ${percentUsed}%`,
      `Limit: ${quota.limit.toLocaleString()} requests`,
      `Used: ${quota.requests.toLocaleString()} requests`,
      `Remaining: ${remaining.toLocaleString()} requests`,
      `Renews: ${quota.renewsAt} (${formatRelativeTime(new Date(quota.renewsAt))})`,
    ].join("\n");
  };

  return [
    "Synthetic API Quotas",
    "",
    formatSection("Subscription", quotas.subscription),
    "",
    formatSection("Search Hourly", quotas.search.hourly),
    "",
    formatSection("Free Tool Calls", quotas.freeToolCalls),
  ].join("\n");
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
