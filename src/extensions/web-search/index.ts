import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSyntheticWebSearchTool } from "./tool";

export default async function (pi: ExtensionAPI) {
  registerSyntheticWebSearchTool(pi);
}
