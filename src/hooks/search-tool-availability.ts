import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SYNTHETIC_WEB_SEARCH_TOOL } from "../tools/search";

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
  pi.on("session_start", () => {
    const current = pi.getActiveTools();
    if (current.includes(SYNTHETIC_WEB_SEARCH_TOOL)) {
      pi.setActiveTools(
        current.filter((toolName) => toolName !== SYNTHETIC_WEB_SEARCH_TOOL),
      );
    }
  });

  // Verify subscription only when user starts agent execution.
  pi.on("before_agent_start", async (_event, ctx) => {
    const apiKey = process.env.SYNTHETIC_API_KEY;
    if (!apiKey) {
      hasAccess = false;
      deniedReason = "SYNTHETIC_API_KEY is not configured";
      accessCheckPromise = undefined;
    } else {
      if (deniedReason === "SYNTHETIC_API_KEY is not configured") {
        deniedReason = undefined;
      }

      if (!hasAccess && !deniedReason) {
        accessCheckPromise ??= checkSubscriptionAccess(apiKey);
        const access = await accessCheckPromise;

        if (!access.ok) {
          deniedReason = access.reason;
        } else {
          hasAccess = true;
          didNotifyDenied = false;
        }
      }
    }

    if (deniedReason) {
      const current = pi.getActiveTools();
      if (current.includes(SYNTHETIC_WEB_SEARCH_TOOL)) {
        pi.setActiveTools(
          current.filter((toolName) => toolName !== SYNTHETIC_WEB_SEARCH_TOOL),
        );
      }

      if (ctx.hasUI && !didNotifyDenied) {
        ctx.ui.notify(
          `Synthetic web search disabled: ${deniedReason}`,
          "warning",
        );
        didNotifyDenied = true;
      }
      return;
    }

    const current = pi.getActiveTools();
    if (!current.includes(SYNTHETIC_WEB_SEARCH_TOOL)) {
      pi.setActiveTools([...current, SYNTHETIC_WEB_SEARCH_TOOL]);
    }
  });
}
