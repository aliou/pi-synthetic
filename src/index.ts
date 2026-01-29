import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSyntheticProvider } from "./providers/index.js";

export default function (pi: ExtensionAPI) {
  registerSyntheticProvider(pi);
}
