import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { fetchQuotas } from "../../utils/quotas";
import { QuotasComponent } from "./components/quotas-display";

export function registerQuotasCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:quotas", {
    description: "Display Synthetic API usage quotas",
    handler: async (_args, ctx) => {
      const result = await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        const component = new QuotasComponent(theme, () => done(null));

        fetchQuotas()
          .then((quotas) => {
            if (!quotas) {
              component.setState({
                type: "error",
                message: "Failed to fetch quotas",
              });
            } else {
              component.setState({ type: "loaded", quotas });
            }
            tui.requestRender();
          })
          .catch(() => {
            component.setState({
              type: "error",
              message: "Failed to fetch quotas",
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
