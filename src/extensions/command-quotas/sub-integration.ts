import type { AuthStorage, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSyntheticApiKey } from "../../lib/env";
import type { QuotasResponse } from "../../types/quotas";
import { fetchQuotas, formatResetTime } from "../../utils/quotas";

interface RateWindow {
  label: string;
  usedPercent: number;
  resetDescription?: string;
  resetAt?: string;
}

interface UsageSnapshot {
  provider: string;
  displayName: string;
  windows: RateWindow[];
  lastSuccessAt?: number;
}

interface SubCoreSettingsPayload {
  settings?: {
    behavior?: {
      refreshInterval: number;
    };
  };
}

function toUsageSnapshot(quotas: QuotasResponse): UsageSnapshot {
  const windows: RateWindow[] = [];

  if (quotas.subscription) {
    const pct =
      (quotas.subscription.requests / quotas.subscription.limit) * 100;
    windows.push({
      label: "5h",
      usedPercent: Math.round(pct),
      resetDescription: formatResetTime(quotas.subscription.renewsAt),
      resetAt: quotas.subscription.renewsAt,
    });
  }

  if (quotas.search?.hourly) {
    const pct =
      (quotas.search.hourly.requests / quotas.search.hourly.limit) * 100;
    windows.push({
      label: "Search",
      usedPercent: Math.round(pct),
      resetDescription: formatResetTime(quotas.search.hourly.renewsAt),
      resetAt: quotas.search.hourly.renewsAt,
    });
  }

  if (quotas.freeToolCalls) {
    const pct =
      (quotas.freeToolCalls.requests / quotas.freeToolCalls.limit) * 100;
    windows.push({
      label: "Tools",
      usedPercent: Math.round(pct),
      resetDescription: formatResetTime(quotas.freeToolCalls.renewsAt),
      resetAt: quotas.freeToolCalls.renewsAt,
    });
  }

  return {
    provider: "synthetic",
    displayName: "Synthetic",
    windows,
    lastSuccessAt: Date.now(),
  };
}

async function emitCurrentUsage(
  pi: ExtensionAPI,
  authStorage: AuthStorage,
): Promise<void> {
  const apiKey = await getSyntheticApiKey(authStorage);
  if (!apiKey) return;
  const quotas = await fetchQuotas(apiKey);
  if (!quotas) return;
  pi.events.emit("sub-core:update-current", {
    state: { provider: "synthetic", usage: toUsageSnapshot(quotas) },
  });
}

export function registerSubIntegration(pi: ExtensionAPI): void {
  let interval: NodeJS.Timeout | undefined;
  let refreshMs = 60000;
  let subCoreReady = false;
  let currentProvider: string | undefined;
  let currentAuthStorage: AuthStorage | undefined;

  function isSynthetic(): boolean {
    return currentProvider === "synthetic";
  }

  function stop(): void {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  }

  function startPolling(authStorage: AuthStorage): void {
    stop();
    currentAuthStorage = authStorage;
    void emitCurrentUsage(pi, authStorage);
    const ms = Math.max(10000, refreshMs);
    interval = setInterval(() => {
      if (isSynthetic() && currentAuthStorage) {
        void emitCurrentUsage(pi, currentAuthStorage);
      }
    }, ms);
    interval.unref?.();
  }

  // Custom events (inter-extension bus)
  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
    // Polling starts in session_start/model_select when provider is synthetic
  });

  pi.events.on("sub-core:settings:updated", (data: unknown) => {
    const payload = data as SubCoreSettingsPayload;
    if (payload.settings?.behavior?.refreshInterval) {
      refreshMs = payload.settings.behavior.refreshInterval * 1000;
      // Restart with new interval if currently running
      if (interval && isSynthetic() && currentAuthStorage) {
        startPolling(currentAuthStorage);
      }
    }
  });

  // Lifecycle events
  pi.on("session_start", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentAuthStorage = ctx.modelRegistry.authStorage;

    if (subCoreReady && isSynthetic()) {
      const apiKey = await getSyntheticApiKey(currentAuthStorage);
      if (apiKey) {
        startPolling(currentAuthStorage);
      }
    }
  });

  pi.on("model_select", async (event, ctx) => {
    currentProvider = event.model?.provider;
    currentAuthStorage = ctx.modelRegistry.authStorage;

    if (subCoreReady && isSynthetic()) {
      const apiKey = await getSyntheticApiKey(currentAuthStorage);
      if (apiKey) {
        startPolling(currentAuthStorage);
      } else {
        stop();
      }
    } else {
      stop();
    }
  });

  pi.on("session_shutdown", () => {
    currentProvider = undefined;
    currentAuthStorage = undefined;
    stop();
  });
}
