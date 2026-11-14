import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFastModeModelId } from "../../src/fast-mode";
import { toggleFastMode } from "../_shared/fast-mode";

export function registerFastModeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:fast", {
    description:
      "Switch the current model to its Synthetic fast variant (uses twice more quota)",
    handler: async (_args, ctx) => {
      if (ctx.model?.provider !== "synthetic") {
        ctx.ui.notify(
          "Synthetic: fast mode requires a Synthetic model",
          "error",
        );
        return;
      }

      if (isFastModeModelId(ctx.model.id)) {
        ctx.ui.notify(
          "Synthetic: already in fast mode, switch model with /model",
          "info",
        );
        return;
      }

      toggleFastMode(pi, (payload) => {
        if (payload.enabled) {
          ctx.ui.notify(
            "Synthetic: fast mode enabled (uses twice more quota)",
            "info",
          );
        }
      });
    },
  });
}
