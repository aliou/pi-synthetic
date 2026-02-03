import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerQuotasCommand } from "./commands/quotas";
import { registerSyntheticProvider } from "./providers/index";
import { registerSyntheticWebSearchTool } from "./tools/search";

export default async function (pi: ExtensionAPI) {
  registerSyntheticProvider(pi);

  // Only register quotas command and web search tool if API key is available
  if (process.env.SYNTHETIC_API_KEY) {
    registerQuotasCommand(pi);
    await registerSyntheticWebSearchTool(pi);
  }
}
