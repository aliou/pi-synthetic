import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../config";
import {
  type QuotasResponse,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
  type SyntheticQuotasUpdatedPayload,
} from "../../types/quotas";
import { formatResetTime } from "../../utils/quotas";

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

export function registerSubBarIntegration(pi: ExtensionAPI): void {
  let subCoreReady = false;
  let currentProvider: string | undefined;
  let enabled = configLoader.getConfig().subBarIntegration;

  function isSynthetic(): boolean {
    return enabled && currentProvider === "synthetic";
  }

  function emitUsage(quotas: QuotasResponse): void {
    pi.events.emit("sub-core:update-current", {
      state: {
        provider: "synthetic",
        usage: toUsageSnapshot(quotas),
      },
    });
  }

  function requestQuotas(): void {
    pi.events.emit(SYNTHETIC_QUOTAS_REQUEST_EVENT, undefined);
  }

  // Receive quota updates from the provider extension
  pi.events.on(SYNTHETIC_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!isSynthetic() || !subCoreReady) return;
    const { quotas } = data as SyntheticQuotasUpdatedPayload;
    emitUsage(quotas);
  });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.subBarIntegration;

    if (!enabled) return;

    if (subCoreReady && currentProvider === "synthetic") {
      requestQuotas();
    }
  });

  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
  });

  pi.on("session_start", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;
  });

  pi.on("model_select", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;

    if (subCoreReady && isSynthetic()) {
      requestQuotas();
    }
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
  });

  pi.on("session_shutdown", () => {
    currentProvider = undefined;
  });
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  registerSubBarIntegration(pi);

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "subBarIntegration",
    });
  });
}
