import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerQuotasCommand } from "./commands/quotas";
import { registerSyntheticWebSearchHooks } from "./hooks/search-tool-availability";
import { registerSubIntegration } from "./hooks/sub-integration";
import { registerSyntheticProvider } from "./providers/index";
import { registerSyntheticWebSearchTool } from "./tools/search";

export default async function (pi: ExtensionAPI) {
  registerSyntheticProvider(pi);
  registerSyntheticWebSearchTool(pi);
  registerSyntheticWebSearchHooks(pi);

  if (process.env.SYNTHETIC_API_KEY) {
    registerQuotasCommand(pi);
    registerSubIntegration(pi);
  }
}
