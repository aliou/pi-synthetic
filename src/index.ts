import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerQuotasCommand } from "./commands/quotas.js";
import { registerSyntheticProvider } from "./providers/index.js";

export default function (pi: ExtensionAPI) {
  registerSyntheticProvider(pi);

  // Only register quotas command if API key is available
  if (process.env.SYNTHETIC_API_KEY) {
    registerQuotasCommand(pi);
  }
}
