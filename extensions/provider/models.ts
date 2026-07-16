// Hardcoded model fallback, synced from https://api.synthetic.new/openai/v1/models
// maxTokens sourced from https://models.dev/api.json (synthetic provider).
//
// This list is used as the offline fallback and as the override catalog for
// model-specific compatibility settings (thinkingLevelMap, compat) that the
// Synthetic API does not expose.

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { SyntheticApiModel } from "../../src/client/types";

export type SyntheticModel = ProviderModelConfig;

export const SYNTHETIC_MODELS: SyntheticModel[] = [
  // API: syn:large:text → ctx=524288, out=65536
  // Reasoning: GLM-5.2 has two effective tiers — `max` (default, highest) and `high`
  // (lower). Per the GLM-5.2 chat template: unset -> max; "high" -> high; every other value
  // falls through to max. So `max > high`.
  // Verified against Synthetic's OpenAI shim: `reasoning_effort: "max"` and `"none"` are
  // accepted. Map the two tiers plus off; hide unsupported intermediate tiers.
  {
    id: "syn:large:text",
    name: "syn:large:text",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text"],
    cost: {
      input: 1.4,
      output: 4.4,
      cacheRead: 1.4,
      cacheWrite: 0,
    },
    contextWindow: 524288,
    maxTokens: 65536,
  },
  // API: syn:small:text → ctx=196608, out=65536
  {
    id: "syn:small:text",
    name: "syn:small:text",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text"],
    cost: {
      input: 0.1,
      output: 0.5,
      cacheRead: 0.1,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  // API: syn:large:vision → ctx=262144, out=65536
  {
    id: "syn:large:vision",
    name: "syn:large:vision",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text", "image"],
    cost: {
      input: 0.95,
      output: 4,
      cacheRead: 0.95,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: syn:small:vision → ctx=262144, out=65536
  {
    id: "syn:small:vision",
    name: "syn:small:vision",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text", "image"],
    cost: {
      input: 0.45,
      output: 3.6,
      cacheRead: 0.45,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:openai/gpt-oss-120b → ctx=131072, out=65536
  {
    id: "hf:openai/gpt-oss-120b",
    name: "openai/gpt-oss-120b",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.1,
      output: 0.1,
      cacheRead: 0.1,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 65536,
  },
  // API: hf:zai-org/GLM-5.2 → ctx=524288, out=65536
  {
    id: "hf:zai-org/GLM-5.2",
    name: "zai-org/GLM-5.2",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text"],
    cost: {
      input: 1.4,
      output: 4.4,
      cacheRead: 1.4,
      cacheWrite: 0,
    },
    contextWindow: 524288,
    maxTokens: 65536,
  },
  // API: hf:zai-org/GLM-4.7-Flash → ctx=196608, out=65536
  {
    id: "hf:zai-org/GLM-4.7-Flash",
    name: "zai-org/GLM-4.7-Flash",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text"],
    cost: {
      input: 0.1,
      output: 0.5,
      cacheRead: 0.1,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  // API: hf:moonshotai/Kimi-K2.7-Code → ctx=262144, out=65536
  {
    id: "hf:moonshotai/Kimi-K2.7-Code",
    name: "moonshotai/Kimi-K2.7-Code",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text", "image"],
    cost: {
      input: 0.95,
      output: 4,
      cacheRead: 0.95,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:Qwen/Qwen3.6-27B → ctx=262144, out=65536
  {
    id: "hf:Qwen/Qwen3.6-27B",
    name: "Qwen/Qwen3.6-27B",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text", "image"],
    cost: {
      input: 0.45,
      output: 3.6,
      cacheRead: 0.45,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:MiniMaxAI/MiniMax-M3 → ctx=262144, out=65536
  {
    id: "hf:MiniMaxAI/MiniMax-M3",
    name: "MiniMaxAI/MiniMax-M3",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
      maxTokensField: "max_completion_tokens",
    },
    input: ["text", "image"],
    cost: {
      input: 0.6,
      output: 1.2,
      cacheRead: 0.6,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4 → ctx=262144, out=65536
  {
    id: "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    name: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsReasoningEffort: true,
    },
    input: ["text"],
    cost: {
      input: 0.3,
      output: 1,
      cacheRead: 0.3,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
];

export function isValidApiModel(model: unknown): model is SyntheticApiModel {
  if (!model || typeof model !== "object") return false;
  const m = model as Partial<SyntheticApiModel>;
  return (
    typeof m.id === "string" &&
    m.id.length > 0 &&
    typeof m.name === "string" &&
    Array.isArray(m.input_modalities) &&
    m.input_modalities.every((x) => typeof x === "string") &&
    Array.isArray(m.output_modalities) &&
    m.output_modalities.every((x) => typeof x === "string") &&
    typeof m.context_length === "number" &&
    Number.isFinite(m.context_length) &&
    typeof m.max_output_length === "number" &&
    Number.isFinite(m.max_output_length) &&
    m.pricing !== null &&
    typeof m.pricing === "object" &&
    typeof m.pricing.prompt === "string" &&
    typeof m.pricing.completion === "string" &&
    typeof m.pricing.input_cache_reads === "string" &&
    typeof m.pricing.input_cache_writes === "string"
  );
}

function parseApiPrice(priceStr: string): number {
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  if (!match) return 0;
  const pricePerToken = Number.parseFloat(match[1]);
  return pricePerToken * 1_000_000;
}

function apiInputModalities(model: SyntheticApiModel): ("text" | "image")[] {
  const inputs = new Set<"text" | "image">();
  for (const modality of model.input_modalities) {
    if (modality === "text" || modality === "image") {
      inputs.add(modality);
    }
  }
  return inputs.size > 0 ? [...inputs] : ["text"];
}

function apiModelSupportsReasoning(model: SyntheticApiModel): boolean {
  return model.supported_features?.includes("reasoning") ?? false;
}

function apiModelToSyntheticModel(model: SyntheticApiModel): SyntheticModel {
  return {
    id: model.id,
    name: model.name,
    reasoning: apiModelSupportsReasoning(model),
    input: apiInputModalities(model),
    cost: {
      input: parseApiPrice(model.pricing.prompt),
      output: parseApiPrice(model.pricing.completion),
      cacheRead: parseApiPrice(model.pricing.input_cache_reads),
      cacheWrite: parseApiPrice(model.pricing.input_cache_writes),
    },
    contextWindow: model.context_length,
    maxTokens: model.max_output_length,
  };
}

function isValidSyntheticModel(model: unknown): model is SyntheticModel {
  if (!model || typeof model !== "object") return false;
  const m = model as Partial<SyntheticModel>;
  return (
    typeof m.id === "string" &&
    m.id.length > 0 &&
    typeof m.name === "string" &&
    typeof m.reasoning === "boolean" &&
    Array.isArray(m.input) &&
    m.input.every((x) => x === "text" || x === "image") &&
    m.input.length > 0 &&
    m.cost !== null &&
    typeof m.cost === "object" &&
    typeof m.cost.input === "number" &&
    Number.isFinite(m.cost.input) &&
    typeof m.cost.output === "number" &&
    Number.isFinite(m.cost.output) &&
    typeof m.contextWindow === "number" &&
    Number.isFinite(m.contextWindow) &&
    typeof m.maxTokens === "number" &&
    Number.isFinite(m.maxTokens)
  );
}

function applyDefaultCompat(model: SyntheticModel): SyntheticModel {
  return {
    ...model,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens" as const,
      ...(model.reasoning ? { supportsReasoningEffort: true } : {}),
      ...model.compat,
    },
  };
}

function mergeWithStaticOverride(
  apiModel: SyntheticModel,
  override: SyntheticModel | undefined,
): SyntheticModel {
  if (!override) return apiModel;

  return {
    ...apiModel,
    thinkingLevelMap: override.thinkingLevelMap ?? apiModel.thinkingLevelMap,
    compat: {
      ...apiModel.compat,
      ...override.compat,
    },
  };
}

export function buildSyntheticProviderModels(): SyntheticModel[] {
  return SYNTHETIC_MODELS.map(applyDefaultCompat);
}

export function buildSyntheticProviderModelsFromApi(
  apiModels: readonly unknown[],
): SyntheticModel[] {
  const overrides = new Map(SYNTHETIC_MODELS.map((m) => [m.id, m]));

  return apiModels
    .map((model, index) => {
      if (!isValidApiModel(model)) {
        const id =
          model && typeof model === "object" && "id" in model
            ? String((model as { id: unknown }).id)
            : String(index);
        throw new Error(`Synthetic API returned invalid model entry "${id}"`);
      }
      return mergeWithStaticOverride(
        apiModelToSyntheticModel(model),
        overrides.get(model.id),
      );
    })
    .map(applyDefaultCompat);
}

export function buildSyntheticProviderModelsFromStore(
  storedModels: readonly unknown[],
): SyntheticModel[] {
  const overrides = new Map(SYNTHETIC_MODELS.map((m) => [m.id, m]));

  return storedModels
    .map((model, index) => {
      if (!isValidSyntheticModel(model)) {
        const id =
          model && typeof model === "object" && "id" in model
            ? String((model as { id: unknown }).id)
            : String(index);
        throw new Error(`Synthetic model store contains invalid entry "${id}"`);
      }
      return mergeWithStaticOverride(model, overrides.get(model.id));
    })
    .map(applyDefaultCompat);
}
