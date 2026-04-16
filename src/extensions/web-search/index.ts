import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  type SyntheticConfigUpdatedPayload,
} from "../../config";
import {
  registerSyntheticWebSearchTool,
  SYNTHETIC_WEB_SEARCH_TOOL,
} from "./tool";

function syncToolActivation(pi: ExtensionAPI, enabled: boolean): void {
  const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
  const activeTools = new Set(pi.getActiveTools());

  if (!allToolNames.has(SYNTHETIC_WEB_SEARCH_TOOL)) return;

  if (enabled) {
    activeTools.add(SYNTHETIC_WEB_SEARCH_TOOL);
  } else {
    activeTools.delete(SYNTHETIC_WEB_SEARCH_TOOL);
  }

  pi.setActiveTools([...activeTools].filter((name) => allToolNames.has(name)));
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let webSearchEnabled = configLoader.getConfig().webSearch;

  registerSyntheticWebSearchTool(pi);

  pi.on("session_start", async () => {
    syncToolActivation(pi, webSearchEnabled);
  });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    webSearchEnabled = (data as SyntheticConfigUpdatedPayload).config.webSearch;
    syncToolActivation(pi, webSearchEnabled);
  });
}
