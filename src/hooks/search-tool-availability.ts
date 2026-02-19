import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { SYNTHETIC_WEB_SEARCH_TOOL } from "../tools/search";

function notifyDebug(ctx: ExtensionContext, message: string): void {
  ctx.ui.notify(`[pi-synthetic:web-search] ${message}`, "info");
}

async function checkSubscriptionAccess(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const response = await fetch("https://api.synthetic.new/v2/quotas", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `Quotas check failed (HTTP ${response.status})`,
      };
    }

    const data = await response.json();
    if (data?.subscription?.limit > 0) {
      return { ok: true };
    }

    return {
      ok: false,
      reason: "No active subscription (search requires a subscription plan)",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { ok: false, reason: `Quotas check failed: ${message}` };
  }
}

export function registerSyntheticWebSearchHooks(pi: ExtensionAPI): void {
  let accessCheckPromise:
    | Promise<{ ok: true } | { ok: false; reason: string }>
    | undefined;
  let hasAccess = false;
  let deniedReason: string | undefined;
  let didNotifyDenied = false;

  // Keep tool inactive at session start. Availability is decided before each agent run.
  pi.on("session_start", (_event, ctx) => {
    notifyDebug(ctx, "session_start: preparing web search tool");

    const current = pi.getActiveTools();
    if (current.includes(SYNTHETIC_WEB_SEARCH_TOOL)) {
      pi.setActiveTools(
        current.filter((toolName) => toolName !== SYNTHETIC_WEB_SEARCH_TOOL),
      );
      notifyDebug(ctx, "session_start: tool disabled until subscription check");
    }
  });

  // Verify subscription only when user starts agent execution.
  pi.on("before_agent_start", async (_event, ctx) => {
    notifyDebug(ctx, "before_agent_start: ensuring tool availability");

    const apiKey = process.env.SYNTHETIC_API_KEY;
    if (!apiKey) {
      hasAccess = false;
      deniedReason = "SYNTHETIC_API_KEY is not configured";
      accessCheckPromise = undefined;
      notifyDebug(ctx, "before_agent_start: access denied (missing API key)");
    } else {
      if (deniedReason === "SYNTHETIC_API_KEY is not configured") {
        deniedReason = undefined;
      }

      if (!hasAccess && !deniedReason) {
        notifyDebug(ctx, "before_agent_start: checking subscription access");
        accessCheckPromise ??= checkSubscriptionAccess(apiKey);
        const access = await accessCheckPromise;

        if (!access.ok) {
          deniedReason = access.reason;
          notifyDebug(
            ctx,
            `before_agent_start: access denied (${access.reason})`,
          );
        } else {
          hasAccess = true;
          didNotifyDenied = false;
          notifyDebug(ctx, "before_agent_start: access granted");
        }
      }
    }

    if (deniedReason) {
      const current = pi.getActiveTools();
      if (current.includes(SYNTHETIC_WEB_SEARCH_TOOL)) {
        pi.setActiveTools(
          current.filter((toolName) => toolName !== SYNTHETIC_WEB_SEARCH_TOOL),
        );
        notifyDebug(ctx, "before_agent_start: tool kept disabled");
      }

      if (ctx.hasUI && !didNotifyDenied) {
        ctx.ui.notify(
          `Synthetic web search disabled: ${deniedReason}`,
          "warning",
        );
        didNotifyDenied = true;
        notifyDebug(
          ctx,
          "before_agent_start: user notified about disabled tool",
        );
      }
      return;
    }

    const current = pi.getActiveTools();
    if (!current.includes(SYNTHETIC_WEB_SEARCH_TOOL)) {
      pi.setActiveTools([...current, SYNTHETIC_WEB_SEARCH_TOOL]);
      notifyDebug(ctx, "before_agent_start: tool enabled");
    }
  });
}
