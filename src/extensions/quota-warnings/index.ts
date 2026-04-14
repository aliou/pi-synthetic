import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { clearAlertState, triggerCheck } from "./notifier";

export default async function (pi: ExtensionAPI) {
  // Session start: reset local warning state and run an immediate check
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.model?.provider !== "synthetic") return;
    clearAlertState();
    triggerCheck(ctx, ctx.model, false);
  });

  // Check after agent turn - only warn for newly crossed thresholds
  pi.on("agent_end", async (_event, ctx) => {
    if (ctx.model?.provider !== "synthetic") return;
    triggerCheck(ctx, ctx.model, true);
  });

  // Clear state on shutdown
  pi.on("session_shutdown", async () => {
    clearAlertState();
  });
}
