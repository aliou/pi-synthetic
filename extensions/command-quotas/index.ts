import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
} from "../../src/config";
import { configLoader } from "../_shared/config/loader";
import { registerQuotasCommand } from "./command";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  const config = configLoader.getConfig();

  if (config.quotasCommand) {
    registerQuotasCommand(pi);
  }

  pi.events.on(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotasCommand",
    });
  });
}
