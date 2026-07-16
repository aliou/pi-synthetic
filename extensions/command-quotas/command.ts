import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
  type SyntheticUtilityApiConfig,
} from "../../src/client";
import { configLoader } from "../../src/config";
import { QuotasComponent } from "./components/quotas-display";

const MISSING_AUTH_MESSAGE =
  "Synthetic quotas requires a Synthetic subscription or an unauthenticated proxy. Add credentials to ~/.pi/agent/auth.json, set SYNTHETIC_API_KEY, or disable proxy auth in /synthetic:settings.";

async function buildQuotasClient(
  config: SyntheticUtilityApiConfig,
  getApiKey: () => Promise<string | undefined>,
): Promise<SyntheticClient | undefined> {
  const options = await resolveSyntheticClientOptions(config, getApiKey);
  if (!options) return undefined;

  return new SyntheticClient(options);
}

export function registerQuotasCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:quotas", {
    description: "Display Synthetic API usage quotas",
    handler: async (_args, ctx) => {
      const config = configLoader.getConfig();
      if (!config.quotasCommand) {
        ctx.ui.notify(
          "Synthetic quotas command is disabled. Restart Pi to unload the command after re-enabling or disabling it.",
          "warning",
        );
        return;
      }

      const client = await buildQuotasClient(config, () =>
        ctx.modelRegistry.getApiKeyForProvider("synthetic"),
      );
      if (!client) {
        ctx.ui.notify(MISSING_AUTH_MESSAGE, "warning");
        return;
      }
      const quotasClient = client;

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
          const fetchResult = await quotasClient.quotas({
            signal: controller.signal,
          });
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
        const fetchResult = await quotasClient.quotas();
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
