import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSyntheticProvider } from "./providers/index.js";
import { registerSyntheticWebSearchTool } from "./tools/search.js";

export default async function (pi: ExtensionAPI) {
  registerSyntheticProvider(pi);
  await registerSyntheticWebSearchTool(pi);
}
