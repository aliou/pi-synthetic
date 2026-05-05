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
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
  type SyntheticQuotasSnapshotPayload,
} from "../../types/quotas";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().quotaWarnings;

  const notifier = new QuotaWarningNotifier();

  function requestQuotas(
    respond?: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void,
  ): void {
    pi.events.emit(SYNTHETIC_QUOTAS_REQUEST_EVENT, {
      respond,
    } satisfies SyntheticQuotasRequestPayload);
  }

  function readQuotas(
    respond: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void,
  ): void {
    pi.events.emit(SYNTHETIC_QUOTAS_READ_EVENT, {
      respond,
    } satisfies SyntheticQuotasReadPayload);
  }

  function evaluateFromStoreOrRefresh(ctx: ExtensionContext): void {
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    readQuotas((snapshot) => {
      if (snapshot) {
        notifier.evaluate(
          snapshot.quotas,
          snapshot.source === "header",
          (message, level) => {
            ctx.ui.notify(message, level);
          },
        );
      } else {
        requestQuotas((refreshed) => {
          if (!refreshed) return;
          notifier.evaluate(
            refreshed.quotas,
            refreshed.source === "header",
            (message, level) => {
              ctx.ui.notify(message, level);
            },
          );
        });
      }
    });
  }

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.quotaWarnings;

    if (!enabled) {
      notifier.clearAlertState();
      return;
    }

    notifier.clearAlertState();
    // In config updates we don't have ctx, so we just clear. The next lifecycle event will refresh.
  });

  pi.on("session_start", (_event, ctx) => {
    notifier.clearAlertState();
    evaluateFromStoreOrRefresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    notifier.clearAlertState();
    evaluateFromStoreOrRefresh(ctx);
  });

  pi.on("agent_end", (_event, ctx) => {
    evaluateFromStoreOrRefresh(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    evaluateFromStoreOrRefresh(ctx);
  });

  pi.on("session_before_switch", () => {
    notifier.clearAlertState();
  });

  pi.on("session_shutdown", () => {
    notifier.clearAlertState();
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
