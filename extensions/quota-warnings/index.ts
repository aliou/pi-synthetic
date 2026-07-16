import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../src/config";
import { QuotaWarningNotifier } from "../../src/services/quota-warnings";
import {
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
  type SyntheticQuotasSnapshotPayload,
} from "../../src/types/quotas";

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
          snapshot.projections,
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
            refreshed.projections,
          );
        });
      }
    });
  }

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const wasEnabled = enabled;
    enabled = (data as SyntheticConfigUpdatedPayload).config.quotaWarnings;

    // Only reset alert state when the feature itself is toggled, so unrelated
    // config changes do not re-trigger one-time warnings.
    if (wasEnabled !== enabled) {
      notifier.clearAlertState();
    }
  });

  // Note: we intentionally do NOT clearAlertState() on session_start or
  // model_select. Quota state is account-wide and persists across sessions;
  // clearing right before evaluate() would hit the first-time-seen path on
  // every switch and bypass the cooldown. Clearing is reserved for genuine
  // identity resets: session_before_switch, session_shutdown, or a config
  // toggle (handled above).
  pi.on("session_start", (_event, ctx) => {
    evaluateFromStoreOrRefresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
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
