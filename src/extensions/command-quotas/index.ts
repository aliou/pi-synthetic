import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerQuotasCommand } from "./command";
import { registerSubIntegration } from "./sub-integration";

export default async function (pi: ExtensionAPI) {
  registerQuotasCommand(pi);
  registerSubIntegration(pi);
}
