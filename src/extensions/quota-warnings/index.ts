import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../config";
import { clearAlertState, triggerCheck } from "./notifier";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().quotaWarnings;
  let currentModel: { provider: string; id: string } | undefined;
  let currentContext: Parameters<typeof triggerCheck>[0] | undefined;

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as SyntheticConfigUpdatedPayload).config.quotaWarnings;

    if (!enabled) {
      clearAlertState();
      return;
    }

    if (currentContext && currentModel?.provider === "synthetic") {
      clearAlertState();
      triggerCheck(currentContext, currentModel, false);
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    currentModel = ctx.model;
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    clearAlertState();
    triggerCheck(ctx, ctx.model, false);
  });

  pi.on("agent_end", async (_event, ctx) => {
    currentContext = ctx;
    currentModel = ctx.model;
    if (!enabled || ctx.model?.provider !== "synthetic") return;
    triggerCheck(ctx, ctx.model, true);
  });

  pi.on("session_shutdown", async () => {
    currentContext = undefined;
    currentModel = undefined;
    clearAlertState();
  });
}
