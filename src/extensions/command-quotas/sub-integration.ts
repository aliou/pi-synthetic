import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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

async function emitCurrentUsage(pi: ExtensionAPI): Promise<void> {
  const quotas = await fetchQuotas();
  if (!quotas) return;
  pi.events.emit("sub-core:update-current", {
    state: { provider: "synthetic", usage: toUsageSnapshot(quotas) },
  });
}

export function registerSubIntegration(pi: ExtensionAPI): void {
  if (!process.env.SYNTHETIC_API_KEY) return;

  let interval: NodeJS.Timeout | undefined;
  let refreshMs = 60000;
  let subCoreReady = false;
  let currentProvider: string | undefined;

  function isSynthetic(): boolean {
    return currentProvider === "synthetic";
  }

  function stop(): void {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  }

  function start(): void {
    stop();
    if (!subCoreReady || !isSynthetic()) {
      return;
    }
    emitCurrentUsage(pi);
    const ms = Math.max(10000, refreshMs);
    interval = setInterval(() => {
      if (isSynthetic()) emitCurrentUsage(pi);
    }, ms);
    interval.unref?.();
  }

  // Custom events (inter-extension bus)
  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
    start();
  });

  pi.events.on("sub-core:settings:updated", (data: unknown) => {
    const payload = data as SubCoreSettingsPayload;
    if (payload.settings?.behavior?.refreshInterval) {
      refreshMs = payload.settings.behavior.refreshInterval * 1000;
      if (interval) start();
    }
  });

  // Lifecycle events (pi.on, not pi.events.on)
  pi.on("session_start", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    start();
  });

  pi.on("model_select", (event, _ctx) => {
    currentProvider = event.model?.provider;
    if (isSynthetic()) {
      emitCurrentUsage(pi);
      start();
    } else {
      stop();
    }
  });

  pi.on("session_shutdown", () => {
    currentProvider = undefined;
    stop();
  });
}
