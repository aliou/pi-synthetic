import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../../config";
import { getSyntheticApiKey } from "../../lib/env";
import { fetchQuotas } from "../../utils/quotas";
import { QuotasComponent } from "./components/quotas-display";

const MISSING_AUTH_MESSAGE =
  "Synthetic quotas requires a Synthetic subscription. Add credentials to ~/.pi/agent/auth.json or set SYNTHETIC_API_KEY environment variable.";

export function registerQuotasCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:quotas", {
    description: "Display Synthetic API usage quotas",
    handler: async (_args, ctx) => {
      if (!configLoader.getConfig().quotasCommand) {
        ctx.ui.notify(
          "Synthetic quotas command is disabled. Restart Pi to unload the command after re-enabling or disabling it.",
          "warning",
        );
        return;
      }

      const apiKey = await getSyntheticApiKey(ctx.modelRegistry.authStorage);
      if (!apiKey) {
        ctx.ui.notify(MISSING_AUTH_MESSAGE, "warning");
        return;
      }
      const key: string = apiKey;

      const result = await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        const controller = new AbortController();
        const component = new QuotasComponent(
          theme,
          tui,
          () => {
            controller.abort();
            done(null);
          },
          () => {
            component.setState({ type: "loading" });
            tui.requestRender();
            void loadQuotas();
          },
        );

        async function loadQuotas(): Promise<void> {
          const fetchResult = await fetchQuotas(key, controller.signal);
          if (controller.signal.aborted) return;
          if (fetchResult.success) {
            component.setState({
              type: "loaded",
              quotas: fetchResult.data.quotas,
            });
          } else {
            component.setState({
              type: "error",
              message: fetchResult.error.message,
            });
          }
          tui.requestRender();
        }

        void loadQuotas();

        return {
          render: (width: number) => component.render(width),
          invalidate: () => component.invalidate(),
          handleInput: (data: string) => component.handleInput(data),
          dispose: () => {
            controller.abort();
            component.destroy();
          },
        };
      });

      // Non-interactive fallback (RPC, print, JSON modes)
      if (result === undefined) {
        const fetchResult = await fetchQuotas(key);
        if (!fetchResult.success) {
          ctx.ui.notify(
            JSON.stringify({ error: fetchResult.error.message }),
            "error",
          );
          return;
        }
        ctx.ui.notify(JSON.stringify(fetchResult.data.quotas), "info");
      }
    },
  });
}
