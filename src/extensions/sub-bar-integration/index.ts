import type { AuthStorage, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../config";
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

  if (quotas.weeklyTokenLimit) {
    const { weeklyTokenLimit } = quotas;
    windows.push({
      label: "Credits",
      usedPercent: Math.round(
        Math.max(0, Math.min(100, 100 - weeklyTokenLimit.percentRemaining)),
      ),
      resetDescription: formatResetTime(weeklyTokenLimit.nextRegenAt),
      resetAt: weeklyTokenLimit.nextRegenAt,
    });
  }

  if (quotas.rollingFiveHourLimit && quotas.rollingFiveHourLimit.max > 0) {
    const { rollingFiveHourLimit } = quotas;
    const used = rollingFiveHourLimit.max - rollingFiveHourLimit.remaining;
    windows.push({
      label: "5h",
      usedPercent: Math.round(
        Math.max(0, Math.min(100, (used / rollingFiveHourLimit.max) * 100)),
      ),
      resetDescription: formatResetTime(rollingFiveHourLimit.nextTickAt),
      resetAt: rollingFiveHourLimit.nextTickAt,
    });
  }

  if (
    !quotas.rollingFiveHourLimit &&
    quotas.subscription?.limit &&
    quotas.subscription.limit > 0
  ) {
    const pct =
      (quotas.subscription.requests / quotas.subscription.limit) * 100;
    windows.push({
      label: "5h",
      usedPercent: Math.round(Math.max(0, Math.min(100, pct))),
      resetDescription: formatResetTime(quotas.subscription.renewsAt),
      resetAt: quotas.subscription.renewsAt,
    });
  }

  if (quotas.search?.hourly?.limit && quotas.search.hourly.limit > 0) {
    const pct =
      (quotas.search.hourly.requests / quotas.search.hourly.limit) * 100;
    windows.push({
      label: "Search",
      usedPercent: Math.round(Math.max(0, Math.min(100, pct))),
      resetDescription: formatResetTime(quotas.search.hourly.renewsAt),
      resetAt: quotas.search.hourly.renewsAt,
    });
  }

  if (quotas.freeToolCalls?.limit && quotas.freeToolCalls.limit > 0) {
    const pct =
      (quotas.freeToolCalls.requests / quotas.freeToolCalls.limit) * 100;
    windows.push({
      label: "Tools",
      usedPercent: Math.round(Math.max(0, Math.min(100, pct))),
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
  const result = await fetchQuotas(apiKey);
  if (!result.success) return;
  pi.events.emit("sub-core:update-current", {
    state: {
      provider: "synthetic",
      usage: toUsageSnapshot(result.data.quotas),
    },
  });
}

export function registerSubBarIntegration(pi: ExtensionAPI): void {
  let interval: NodeJS.Timeout | undefined;
  let refreshMs = 60000;
  let subCoreReady = false;
  let currentProvider: string | undefined;
  let currentAuthStorage: AuthStorage | undefined;
  let enabled = configLoader.getConfig().subBarIntegration;

  function isSynthetic(): boolean {
    return enabled && currentProvider === "synthetic";
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

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.subBarIntegration;

    if (!enabled) {
      stop();
      return;
    }

    if (subCoreReady && currentAuthStorage && currentProvider === "synthetic") {
      startPolling(currentAuthStorage);
    }
  });

  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
  });

  pi.events.on("sub-core:settings:updated", (data: unknown) => {
    const payload = data as SubCoreSettingsPayload;
    if (payload.settings?.behavior?.refreshInterval) {
      refreshMs = payload.settings.behavior.refreshInterval * 1000;
      if (interval && isSynthetic() && currentAuthStorage) {
        startPolling(currentAuthStorage);
      }
    }
  });

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

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  registerSubBarIntegration(pi);
}
