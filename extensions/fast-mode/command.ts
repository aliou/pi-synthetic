import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { toggleFastMode } from "../_shared/fast-mode";

export function registerFastModeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("synthetic:fast", {
    description:
      "Toggle the Synthetic fast variant of the current model (uses twice more quota)",
    handler: async (_args, ctx) => {
      if (ctx.model?.provider !== "synthetic") {
        ctx.ui.notify(
          "Synthetic: fast mode requires a Synthetic model",
          "error",
        );
        return;
      }

      toggleFastMode(pi, (payload) => {
        ctx.ui.notify(
          `Synthetic: fast mode ${payload.enabled ? "enabled (uses twice more quota)" : "disabled"}`,
          "info",
        );
      });
    },
  });
}
