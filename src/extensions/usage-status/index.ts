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
import {
  type QuotasResponse,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
  type SyntheticQuotasUpdatedPayload,
} from "../../types/quotas";
import { formatResetTime } from "../../utils/quotas";
import {
  assessWindow,
  getSeverityColor,
  type RiskSeverity,
  toWindows,
} from "../../utils/quotas-severity";

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
  let currentContext: ExtensionContext | undefined;
  let currentProvider: string | undefined;
  let lastSnapshot: WindowStatus[] | undefined;

  function renderFromSnapshot(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    if (!lastSnapshot || lastSnapshot.length === 0) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return;
    }
    ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, lastSnapshot));
  }

  function requestQuotas(): void {
    pi.events.emit(SYNTHETIC_QUOTAS_REQUEST_EVENT, undefined);
  }

  function setLoadingStatus(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(EXTENSION_ID, ctx.ui.theme.fg("dim", "loading usage..."));
  }

  function clearStatus(ctx?: ExtensionContext): void {
    lastSnapshot = undefined;
    ctx?.ui.setStatus(EXTENSION_ID, undefined);
  }

  // Receive quota updates from the provider extension
  pi.events.on(SYNTHETIC_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!enabled || currentProvider !== "synthetic") return;
    const { quotas } = data as SyntheticQuotasUpdatedPayload;
    lastSnapshot = parseSnapshot(quotas);
    if (currentContext) renderFromSnapshot(currentContext);
  });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.usageStatus;
    if (!enabled) {
      clearStatus(currentContext);
    } else if (currentContext && currentProvider === "synthetic") {
      if (lastSnapshot) {
        renderFromSnapshot(currentContext);
      } else {
        setLoadingStatus(currentContext);
        requestQuotas();
      }
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    // The provider extension fetches quotas on session_start and emits the
    // result via synthetic:quotas:updated. Just show loading and wait.
    if (lastSnapshot) {
      renderFromSnapshot(ctx);
    } else {
      setLoadingStatus(ctx);
    }
  });

  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (!enabled || ctx.model?.provider !== "synthetic") {
      clearStatus(ctx);
      return;
    }
    if (lastSnapshot) {
      renderFromSnapshot(ctx);
    } else {
      setLoadingStatus(ctx);
      requestQuotas();
    }
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (enabled && ctx.model?.provider === "synthetic") {
      if (lastSnapshot) {
        renderFromSnapshot(ctx);
      } else {
        setLoadingStatus(ctx);
      }
    } else {
      clearStatus(ctx);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    currentContext = undefined;
    currentProvider = undefined;
    clearStatus(ctx);
  });

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "usageStatus",
    });
  });
}
