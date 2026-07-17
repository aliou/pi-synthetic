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
import { QuotaHistory } from "../../src/services/quota-history";
import { QuotaWarningNotifier } from "../../src/services/quota-warnings";
import {
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
  type SyntheticQuotasSnapshotPayload,
  type SyntheticQuotasUpdatedPayload,
} from "../../src/types/quotas";
import { buildProjectionHints } from "../../src/utils/quotas-projection";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().quotaWarnings;

  const notifier = new QuotaWarningNotifier();
  const history = new QuotaHistory();
  let historyReady = Promise.resolve();
  if (enabled) {
    historyReady = history.initialize();
    await historyReady;
  }

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

  async function evaluateSnapshot(
    snapshot: SyntheticQuotasSnapshotPayload,
    ctx: ExtensionContext,
  ): Promise<void> {
    await historyReady;
    if (!enabled || ctx.model?.provider !== "synthetic") return;

    history.record(snapshot);
    const projections = buildProjectionHints(history.getSnapshots());
    notifier.evaluate(
      snapshot.quotas,
      (message, level) => {
        ctx.ui.notify(message, level);
      },
      projections,
    );
  }

  function evaluateFromStoreOrRefresh(ctx: ExtensionContext): void {
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    readQuotas((snapshot) => {
      if (snapshot) {
        evaluateSnapshot(snapshot, ctx).catch(() => undefined);
      } else {
        requestQuotas((refreshed) => {
          if (!refreshed) return;
          evaluateSnapshot(refreshed, ctx).catch(() => undefined);
        });
      }
    });
  }

  pi.events.on(SYNTHETIC_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!enabled) return;
    const snapshot = data as SyntheticQuotasUpdatedPayload;
    historyReady
      .then(() => {
        if (enabled) history.record(snapshot);
      })
      .catch(() => undefined);
  });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const wasEnabled = enabled;
    enabled = (data as SyntheticConfigUpdatedPayload).config.quotaWarnings;

    // Only reset alert state when the feature itself is toggled, so unrelated
    // config changes do not re-trigger one-time warnings.
    if (wasEnabled !== enabled) {
      notifier.clearAlertState();
      if (enabled) historyReady = history.initialize();
    }
  });

  // Alert transitions and quota history are account-wide, so neither is reset
  // on session/model changes. The user can toggle warnings to reset alerts.
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

  pi.on("session_before_switch", async () => {
    await history.flush();
  });

  pi.on("session_shutdown", async () => {
    await history.flush();
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
