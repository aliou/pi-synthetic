import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { hasSyntheticApiKey } from "../../lib/env";
import { registerSyntheticWebSearchHooks } from "./hooks";
import { registerSyntheticWebSearchTool } from "./tool";

export default async function (pi: ExtensionAPI) {
  if (!hasSyntheticApiKey()) {
    return;
  }

  registerSyntheticWebSearchTool(pi);
  registerSyntheticWebSearchHooks(pi);
}
