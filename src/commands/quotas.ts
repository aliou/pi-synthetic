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
      if (!ctx.hasUI) {
        const quotas = await fetchQuotas();
        if (!quotas) {
          console.error("Failed to fetch quotas");
          return;
        }
        console.log(formatQuotasPlain(quotas));
        return;
      }

      const result = await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        let currentComponent: Component = new QuotasLoadingComponent(theme);

        fetchQuotas()
          .then((quotas) => {
            if (!quotas) {
              currentComponent = new QuotasErrorComponent(
                theme,
                "Failed to fetch quotas",
              );
            } else {
              currentComponent = new QuotasDisplayComponent(theme, quotas);
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
          handleInput: (_data: string) => {
            done();
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
  const remaining = quotas.subscription.limit - quotas.subscription.requests;
  const percentUsed = Math.round(
    (quotas.subscription.requests / quotas.subscription.limit) * 100,
  );

  return [
    "Synthetic API Quotas",
    "",
    `Usage: ${percentUsed}%`,
    `Limit: ${quotas.subscription.limit.toLocaleString()} requests`,
    `Used: ${quotas.subscription.requests.toLocaleString()} requests`,
    `Remaining: ${remaining.toLocaleString()} requests`,
    "",
    `Renews: ${quotas.subscription.renewsAt} (${formatRelativeTime(new Date(quotas.subscription.renewsAt))})`,
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
