import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../../config";
import { registerQuotasCommand } from "./command";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  const config = configLoader.getConfig();

  if (config.quotasCommand) {
    registerQuotasCommand(pi);
  }
}
