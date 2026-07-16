import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
} from "../../src/client";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../src/config";
import { detectBillingMode } from "../../src/utils/quotas";
import {
  registerSyntheticWebSearchTool,
  SYNTHETIC_WEB_SEARCH_TOOL,
} from "./tool";

export type WebSearchEntitlement = "unknown" | "subscription" | "pay-as-you-go";

export function shouldActivateWebSearch(
  enabled: boolean,
  entitlement: WebSearchEntitlement,
): boolean {
  return enabled && entitlement === "subscription";
}

function syncToolActivation(pi: ExtensionAPI, active: boolean): void {
  const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
  const activeTools = new Set(pi.getActiveTools());

  if (!allToolNames.has(SYNTHETIC_WEB_SEARCH_TOOL)) return;

  if (active) {
    activeTools.add(SYNTHETIC_WEB_SEARCH_TOOL);
  } else {
    activeTools.delete(SYNTHETIC_WEB_SEARCH_TOOL);
  }

  pi.setActiveTools([...activeTools].filter((name) => allToolNames.has(name)));
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let config = configLoader.getConfig();
  let entitlement: WebSearchEntitlement = "unknown";
  let getApiKey: (() => Promise<string | undefined>) | undefined;
  let quotaCheckId = 0;
  let quotaCheckController: AbortController | undefined;

  registerSyntheticWebSearchTool(pi);

  function syncActivation(): void {
    syncToolActivation(
      pi,
      shouldActivateWebSearch(config.webSearch, entitlement),
    );
  }

  function cancelQuotaCheck(): void {
    quotaCheckId++;
    quotaCheckController?.abort();
    quotaCheckController = undefined;
  }

  function refreshEntitlement(): void {
    cancelQuotaCheck();
    const checkId = quotaCheckId;
    const controller = new AbortController();
    quotaCheckController = controller;

    void (async () => {
      try {
        const options = await resolveSyntheticClientOptions(config, () =>
          getApiKey ? getApiKey() : Promise.resolve(undefined),
        );
        if (!options || checkId !== quotaCheckId) return;

        const result = await new SyntheticClient(options).quotas({
          signal: controller.signal,
        });
        if (checkId !== quotaCheckId || !result.success) return;

        entitlement =
          detectBillingMode(result.data.quotas) === "subscription"
            ? "subscription"
            : "pay-as-you-go";
        syncActivation();
      } catch (error) {
        // Keep the tool inactive until a successful quota response proves
        // subscription eligibility.
        void error;
      }
    })();
  }

  pi.on("session_start", async (_event, ctx) => {
    cancelQuotaCheck();
    entitlement = "unknown";
    getApiKey = () => ctx.modelRegistry.getApiKeyForProvider("synthetic");
    syncActivation();
    refreshEntitlement();
  });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const nextConfig = (data as SyntheticConfigUpdatedPayload).config;
    const connectionChanged =
      nextConfig.proxyUrl !== config.proxyUrl ||
      nextConfig.proxyRequiresAuth !== config.proxyRequiresAuth;
    const becameEnabled = !config.webSearch && nextConfig.webSearch;

    config = nextConfig;

    if (connectionChanged || (becameEnabled && entitlement === "unknown")) {
      entitlement = "unknown";
      syncActivation();
      refreshEntitlement();
      return;
    }

    syncActivation();
  });

  pi.on("session_before_switch", () => {
    cancelQuotaCheck();
    getApiKey = undefined;
  });

  pi.on("session_shutdown", () => {
    cancelQuotaCheck();
    getApiKey = undefined;
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "webSearch",
    });
  });
}
