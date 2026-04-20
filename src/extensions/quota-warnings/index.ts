import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../config";
import { QuotaWarningNotifier } from "../../services/quota-warnings";
import {
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
  type SyntheticQuotasUpdatedPayload,
} from "../../types/quotas";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().quotaWarnings;
  let currentProvider: string | undefined;
  let currentContext: ExtensionContext | undefined;

  // Pi-agnostic notifier — all logic is testable without Pi
  const notifier = new QuotaWarningNotifier();

  function requestQuotas(): void {
    pi.events.emit(SYNTHETIC_QUOTAS_REQUEST_EVENT, undefined);
  }

  // Receive quota updates from the provider extension and evaluate warnings
  pi.events.on(SYNTHETIC_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!enabled || currentProvider !== "synthetic" || !currentContext) return;
    const { quotas, source } = data as SyntheticQuotasUpdatedPayload;
    notifier.evaluate(quotas, source === "header", (message, level) => {
      if (currentContext) currentContext.ui.notify(message, level);
    });
  });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.quotaWarnings;

    if (!enabled) {
      notifier.clearAlertState();
      return;
    }

    if (currentContext && currentProvider === "synthetic") {
      notifier.clearAlertState();
      requestQuotas();
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    notifier.clearAlertState();
    // Provider fetches on session_start; warnings fire when the event arrives.
  });

  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (!enabled || ctx.model?.provider !== "synthetic") {
      notifier.clearAlertState();
      return;
    }
    notifier.clearAlertState();
    requestQuotas();
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
  });

  pi.on("session_shutdown", () => {
    currentContext = undefined;
    currentProvider = undefined;
    notifier.clearAlertState();
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
