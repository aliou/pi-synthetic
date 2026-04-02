import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { hasSyntheticApiKey } from "../../lib/env";
import { registerQuotasCommand } from "./command";
import { registerSubIntegration } from "./sub-integration";

export default async function (pi: ExtensionAPI) {
  if (!hasSyntheticApiKey()) {
    return;
  }

  registerQuotasCommand(pi);
  registerSubIntegration(pi);
}
