import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SYNTHETIC_MODELS } from "./models.js";

export function registerSyntheticProvider(pi: ExtensionAPI): void {
  pi.registerProvider("synthetic", {
    baseUrl: "https://api.synthetic.new/anthropic",
    apiKey: "SYNTHETIC_API_KEY",
    api: "anthropic-messages",
    models: SYNTHETIC_MODELS.map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    })),
  });
}
