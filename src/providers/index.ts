import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SYNTHETIC_MODELS } from "./models.js";

export function registerSyntheticProvider(pi: ExtensionAPI): void {
  pi.registerProvider("synthetic", {
    baseUrl: "https://api.synthetic.new/openai/v1",
    apiKey: "SYNTHETIC_API_KEY",
    api: "openai-completions",
    models: SYNTHETIC_MODELS.map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
      },
    })),
  });
}
