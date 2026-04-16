import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
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

function createStatusRefresher() {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let activeContext: ExtensionContext | undefined;
  let isRefreshInFlight = false;
  let queuedRefresh = false;
  let lastSnapshot: WindowStatus[] | undefined;

  async function updateFooterStatus(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;
    if (isRefreshInFlight) {
      queuedRefresh = true;
      return;
    }
    isRefreshInFlight = true;
    try {
      const apiKey = await getSyntheticApiKey(ctx.modelRegistry.authStorage);
      if (!apiKey) {
        lastSnapshot = undefined;
        ctx.ui.setStatus(EXTENSION_ID, undefined);
        return;
      }
      const result = await fetchQuotas(apiKey);
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
      ctx.ui.setStatus(
        EXTENSION_ID,
        ctx.ui.theme.fg("warning", "usage unavailable"),
      );
    } finally {
      isRefreshInFlight = false;
      if (queuedRefresh) {
        queuedRefresh = false;
        void updateFooterStatus(ctx);
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
      if (!activeContext) return;
      void updateFooterStatus(activeContext);
    }, REFRESH_INTERVAL_MS);
    refreshTimer.unref?.();
  }

  function stopAutoRefresh(ctx?: ExtensionContext): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
    ctx?.ui.setStatus(EXTENSION_ID, undefined);
  }

  async function setLoadingStatus(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;
    const apiKey = await getSyntheticApiKey(
      ctx.modelRegistry.authStorage,
    ).catch(() => undefined);
    if (!apiKey) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return;
    }
    ctx.ui.setStatus(EXTENSION_ID, ctx.ui.theme.fg("dim", "loading usage..."));
  }

  function renderFromLastSnapshot(ctx: ExtensionContext): boolean {
    if (!ctx.hasUI || !lastSnapshot) return false;
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
  const refresher = createStatusRefresher();

  pi.on("session_start", (_event, ctx) => {
    if (ctx.model?.provider !== "synthetic") return;
    refresher.startAutoRefresh();
    void (async () => {
      await refresher.setLoadingStatus(ctx);
      await refresher.refreshFor(ctx);
    })();
  });

  pi.on("turn_end", (_event, ctx) => {
    if (ctx.model?.provider !== "synthetic") return;
    void refresher.refreshFor(ctx);
  });

  pi.on("session_switch", (_event, ctx) => {
    if (ctx.model?.provider === "synthetic") {
      void refresher.refreshFor(ctx);
    } else {
      refresher.stopAutoRefresh(ctx);
    }
  });

  pi.on("model_select", (_event, ctx) => {
    if (ctx.model?.provider === "synthetic") {
      refresher.startAutoRefresh();
      void refresher.refreshFor(ctx);
    } else {
      refresher.stopAutoRefresh(ctx);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    refresher.stopAutoRefresh(ctx);
  });
}
