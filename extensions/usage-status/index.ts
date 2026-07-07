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
import {
  type QuotasResponse,
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
  type SyntheticQuotasSnapshotPayload,
} from "../../src/types/quotas";
import { formatResetTime } from "../../src/utils/quotas";
import {
  assessWindow,
  getSeverityColor,
  type RiskSeverity,
  toWindows,
} from "../../src/utils/quotas-severity";

const EXTENSION_ID = "synthetic-usage";

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

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().usageStatus;

  function requestQuotas(
    respond: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void,
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

  function renderSnapshot(
    ctx: ExtensionContext,
    snapshot: SyntheticQuotasSnapshotPayload | undefined,
  ): void {
    if (!ctx.hasUI) return;
    if (!snapshot) {
      ctx.ui.setStatus(
        EXTENSION_ID,
        ctx.ui.theme.fg("dim", "loading usage..."),
      );
      return;
    }

    const windows = parseSnapshot(snapshot.quotas);
    if (windows.length === 0) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return;
    }

    ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, windows));
  }

  function clearStatus(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(EXTENSION_ID, undefined);
  }

  function renderFromStoreOrRefresh(ctx: ExtensionContext): void {
    if (!enabled || ctx.model?.provider !== "synthetic") {
      clearStatus(ctx);
      return;
    }
    readQuotas((snapshot) => {
      if (snapshot) {
        renderSnapshot(ctx, snapshot);
      } else {
        renderSnapshot(ctx, undefined); // show loading
        requestQuotas((refreshed) => renderSnapshot(ctx, refreshed));
      }
    });
  }

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.usageStatus;
  });

  pi.on("session_start", (_event, ctx) => {
    renderFromStoreOrRefresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    renderFromStoreOrRefresh(ctx);
  });

  pi.on("agent_end", (_event, ctx) => {
    renderFromStoreOrRefresh(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    renderFromStoreOrRefresh(ctx);
  });

  pi.on("session_before_switch", (_event, ctx) => {
    clearStatus(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    clearStatus(ctx);
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "usageStatus",
    });
  });
}
