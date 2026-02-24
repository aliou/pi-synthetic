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

      // RPC fallback: return JSON
      if (result === undefined) {
        const quotas = await fetchQuotas();
        if (!quotas) {
          ctx.ui.notify(
            JSON.stringify({ error: "Failed to fetch quotas" }),
            "error",
          );
          return;
        }
        ctx.ui.notify(JSON.stringify(quotas, null, 2), "info");
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
