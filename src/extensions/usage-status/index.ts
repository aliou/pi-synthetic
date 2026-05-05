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
import { getSyntheticApiKey } from "../../lib/env";
import type { QuotasResponse } from "../../types/quotas";
import { fetchQuotas, formatResetTime } from "../../utils/quotas";
import {
  assessWindow,
  getSeverityColor,
  type RiskSeverity,
  toWindows,
} from "../../utils/quotas-severity";

const EXTENSION_ID = "synthetic-usage";
const REFRESH_INTERVAL_MS = 60_000;

type WindowStatus = {
  label: string;
  usedPercent: number;
  severity: RiskSeverity;
  resetsAt: string | null;
  limited: boolean;
};

function parseSnapshot(quotas: QuotasResponse): WindowStatus[] {
  const windows = toWindows(quotas);
  return windows.map((w) => {
    const assessment = assessWindow(w);
    return {
      label: w.label,
      usedPercent: w.usedPercent,
      severity: assessment.severity,
      resetsAt: w.resetsAt.toISOString(),
      limited: w.limited ?? false,
    };
  });
}

const SHORT_LABELS: Record<string, string> = {
  "Credits / week": "week",
  "Requests / 5h": "5h",
  "Search / hour": "search",
  "Free Tool Calls / day": "tools",
};

function formatStatus(ctx: ExtensionContext, windows: WindowStatus[]): string {
  const theme = ctx.ui.theme;
  const parts: string[] = [];

  for (const w of windows) {
    const short = SHORT_LABELS[w.label] ?? w.label;
    const remaining = Math.max(
      0,
      Math.min(100, Math.round(100 - w.usedPercent)),
    );
    const color = getSeverityColor(w.severity);
    const pctText = theme.fg(color, `${remaining}%`);
    const reset = w.resetsAt
      ? theme.fg("dim", ` (\u21ba${formatResetTime(w.resetsAt)})`)
      : "";
    const limitTag = w.limited ? theme.fg("error", " [limited]") : "";
    parts.push(`${theme.fg("dim", `${short}:`)}${pctText}${reset}${limitTag}`);
  }

  return parts.join(" ");
}

/**
 * Check if an ExtensionContext is still usable.
 * Pi's ExtensionContext getters (hasUI, ui, modelRegistry, etc.) call
 * assertActive() internally, which throws if the ctx is stale after
 * session replacement, reload, or fork. This helper safely probes
 * hasUI to detect staleness without crashing.
 */
function isCtxLive(ctx: ExtensionContext | undefined): ctx is ExtensionContext {
  if (!ctx) return false;
  try {
    // hasUI is a getter that throws on stale contexts.
    // If it returns false, the ctx is live but in a non-UI mode —
    // we keep it alive but skip UI updates.
    return ctx.hasUI !== undefined;
  } catch {
    return false;
  }
}

function createStatusRefresher() {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let activeContext: ExtensionContext | undefined;
  let isRefreshInFlight = false;
  let queuedRefresh = false;
  let lastSnapshot: WindowStatus[] | undefined;

  async function updateFooterStatus(ctx: ExtensionContext): Promise<void> {
    if (!isCtxLive(ctx)) return;
    if (!ctx.hasUI) return;
    if (isRefreshInFlight) {
      queuedRefresh = true;
      return;
    }
    isRefreshInFlight = true;
    try {
      const apiKey = await getSyntheticApiKey(ctx.modelRegistry.authStorage);
      // Re-check liveness after async gap — ctx may have gone stale during await
      if (!isCtxLive(ctx)) return;
      if (!apiKey) {
        lastSnapshot = undefined;
        ctx.ui.setStatus(EXTENSION_ID, undefined);
        return;
      }
      const result = await fetchQuotas(apiKey);
      // Re-check liveness after second async gap
      if (!isCtxLive(ctx)) return;
      if (!result.success) {
        ctx.ui.setStatus(
          EXTENSION_ID,
          ctx.ui.theme.fg("warning", "usage unavailable"),
        );
        return;
      }
      const windows = parseSnapshot(result.data.quotas);
      lastSnapshot = windows;
      if (windows.length === 0) {
        ctx.ui.setStatus(EXTENSION_ID, undefined);
        return;
      }
      ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, windows));
    } catch {
      // Use isCtxLive instead of touching ctx directly — the catch path
      // previously called ctx.ui.setStatus which re-throws on stale ctx
      if (!isCtxLive(ctx)) return;
      try {
        ctx.ui.setStatus(
          EXTENSION_ID,
          ctx.ui.theme.fg("warning", "usage unavailable"),
        );
      } catch {
        // Stale ctx detected after isCtxLive check — silently abandon
      }
    } finally {
      isRefreshInFlight = false;
      if (queuedRefresh) {
        queuedRefresh = false;
        // Use activeContext (the current session) instead of the captured
        // ctx parameter, which may belong to a previous session
        const nextCtx = activeContext;
        if (isCtxLive(nextCtx)) {
          void updateFooterStatus(nextCtx);
        }
      }
    }
  }

  function refreshFor(ctx: ExtensionContext): Promise<void> {
    activeContext = ctx;
    return updateFooterStatus(ctx);
  }

  function startAutoRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!isCtxLive(activeContext)) {
        activeContext = undefined;
        return;
      }
      void updateFooterStatus(activeContext);
    }, REFRESH_INTERVAL_MS);
    refreshTimer.unref?.();
  }

  function stopAutoRefresh(ctx?: ExtensionContext): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
    activeContext = undefined;
    if (isCtxLive(ctx)) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
    }
  }

  async function setLoadingStatus(ctx: ExtensionContext): Promise<void> {
    if (!isCtxLive(ctx)) return;
    const apiKey = await getSyntheticApiKey(
      ctx.modelRegistry.authStorage,
    ).catch(() => undefined);
    // Re-check after async gap
    if (!isCtxLive(ctx)) return;
    if (!apiKey) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return;
    }
    ctx.ui.setStatus(EXTENSION_ID, ctx.ui.theme.fg("dim", "loading usage..."));
  }

  function renderFromLastSnapshot(ctx: ExtensionContext): boolean {
    if (!isCtxLive(ctx) || !lastSnapshot) return false;
    ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, lastSnapshot));
    return true;
  }

  return {
    refreshFor,
    startAutoRefresh,
    stopAutoRefresh,
    setLoadingStatus,
    renderFromLastSnapshot,
  };
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  const refresher = createStatusRefresher();
  let enabled = configLoader.getConfig().usageStatus;
  let currentContext: ExtensionContext | undefined;
  let currentProvider: string | undefined;

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.usageStatus;

    if (!enabled) {
      refresher.stopAutoRefresh(currentContext);
      return;
    }

    if (isCtxLive(currentContext) && currentProvider === "synthetic") {
      refresher.startAutoRefresh();
      void refresher.refreshFor(currentContext);
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    refresher.startAutoRefresh();
    await refresher.setLoadingStatus(ctx);
    await refresher.refreshFor(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    void refresher.refreshFor(ctx);
  });

  pi.on("session_start", (event, ctx) => {
    // Handle session switches (model_select handles mid-session provider changes)
    if (
      event.reason === "new" ||
      event.reason === "resume" ||
      event.reason === "fork"
    ) {
      currentContext = ctx;
      currentProvider = ctx.model?.provider;
      if (enabled && ctx.model?.provider === "synthetic") {
        void refresher.refreshFor(ctx);
      } else {
        refresher.stopAutoRefresh(ctx);
      }
    }
  });

  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (enabled && ctx.model?.provider === "synthetic") {
      refresher.startAutoRefresh();
      void refresher.refreshFor(ctx);
    } else {
      refresher.stopAutoRefresh(ctx);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    currentContext = undefined;
    currentProvider = undefined;
    refresher.stopAutoRefresh(ctx);
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "usageStatus",
    });
  });
}
