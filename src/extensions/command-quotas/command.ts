import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSyntheticApiKey } from "../../lib/env";
import { fetchQuotas } from "../../utils/quotas";
import { QuotasComponent } from "./components/quotas-display";

const MISSING_AUTH_MESSAGE =
  "Synthetic quotas requires a Synthetic subscription. Add credentials to ~/.pi/agent/auth.json or set SYNTHETIC_API_KEY environment variable.";

export function registerQuotasCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:quotas", {
    description: "Display Synthetic API usage quotas",
    handler: async (_args, ctx) => {
      const apiKey = await getSyntheticApiKey(ctx.modelRegistry.authStorage);
      if (!apiKey) {
        ctx.ui.notify(MISSING_AUTH_MESSAGE, "warning");
        return;
      }

      const result = await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        const component = new QuotasComponent(theme, () => done(null));

        fetchQuotas(apiKey)
          .then((quotas) => {
            if (!quotas) {
              component.setState({
                type: "error",
                message:
                  "Failed to fetch quotas. Check your Synthetic subscription status.",
              });
            } else {
              component.setState({ type: "loaded", quotas });
            }
            tui.requestRender();
          })
          .catch(() => {
            component.setState({
              type: "error",
              message:
                "Failed to fetch quotas. Check your Synthetic subscription status.",
            });
            tui.requestRender();
          });

        return {
          render: (width: number) => component.render(width),
          invalidate: () => component.invalidate(),
          handleInput: (data: string) => component.handleInput(data),
        };
      });

      // RPC fallback: return JSON
      if (result === undefined) {
        const quotas = await fetchQuotas(apiKey);
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
