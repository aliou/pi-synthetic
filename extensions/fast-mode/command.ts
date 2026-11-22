import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  isVirtualModel,
  resolveFastModeModel,
  toggleFastMode,
} from "../_shared/fast-mode";

export function registerFastModeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:fast", {
    description:
      "Toggle the Synthetic fast variant of the current model (uses twice more quota)",
    handler: async (_args, ctx) => {
      const model = resolveFastModeModel(ctx);
      if (!model) {
        ctx.ui.notify(
          isVirtualModel(ctx.model)
            ? "Synthetic: fast mode is unavailable until the virtual model routes to a Synthetic model"
            : "Synthetic: fast mode requires a Synthetic model",
          "error",
        );
        return;
      }

      toggleFastMode(pi, model, (payload) => {
        ctx.ui.notify(
          `Synthetic: fast mode ${payload.enabled ? "enabled (uses twice more quota)" : "disabled"}`,
          "info",
        );
      });
    },
  });
}
