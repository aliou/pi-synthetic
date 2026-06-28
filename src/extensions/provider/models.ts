// Hardcoded models from Synthetic API
// Source: https://api.synthetic.new/openai/v1/models
// maxTokens sourced from https://models.dev/api.json (synthetic provider)

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export interface SyntheticModelConfig extends ProviderModelConfig {
  /** Upstream backend Synthetic proxies this model through (e.g. "fireworks", "together", "synthetic"). */
  provider: string;
}

/** A thin alias that resolves to a concrete model at build time. */
export interface SyntheticModelAliasConfig {
  id: string;
  name: string;
  /** Full model ID of the concrete target this alias resolves to. */
  aliasFor: string;
}

/** Concrete model with full spec; aliases are excluded. */
export type ConcreteSyntheticModelConfig = SyntheticModelConfig & {
  aliasFor?: never;
};

export function isAlias(
  entry: ConcreteSyntheticModelConfig | SyntheticModelAliasConfig,
): entry is SyntheticModelAliasConfig {
  return "aliasFor" in entry;
}

export type SyntheticModelEntry =
  | ConcreteSyntheticModelConfig
  | SyntheticModelAliasConfig;

export const SYNTHETIC_MODELS: SyntheticModelEntry[] = [
  // API: syn:large:text → alias for hf:zai-org/GLM-5.2
  {
    id: "syn:large:text",
    name: "syn:large:text",
    aliasFor: "hf:zai-org/GLM-5.2",
  },
  // API: syn:small:text → alias for hf:zai-org/GLM-4.7-Flash
  {
    id: "syn:small:text",
    name: "syn:small:text",
    aliasFor: "hf:zai-org/GLM-4.7-Flash",
  },
  // API: syn:large:vision → alias for hf:moonshotai/Kimi-K2.6
  {
    id: "syn:large:vision",
    name: "syn:large:vision",
    aliasFor: "hf:moonshotai/Kimi-K2.6",
  },
  // API: syn:small:vision → alias for hf:Qwen/Qwen3.6-27B
  {
    id: "syn:small:vision",
    name: "syn:small:vision",
    aliasFor: "hf:Qwen/Qwen3.6-27B",
  },
  // API: hf:zai-org/GLM-4.7 → ctx=202752
  {
    id: "hf:zai-org/GLM-4.7",
    name: "zai-org/GLM-4.7",
    provider: "synthetic",
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
      input: 0.45,
      output: 2.19,
      cacheRead: 0.45,
      cacheWrite: 0,
    },
    contextWindow: 202752,
    maxTokens: 65536,
  },
  // API: hf:zai-org/GLM-5.1 → ctx=196608, out=65536
  {
    id: "hf:zai-org/GLM-5.1",
    name: "zai-org/GLM-5.1",
    provider: "synthetic",
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
      supportsDeveloperRole: false,
    },
    input: ["text"],
    cost: {
      input: 1,
      output: 3,
      cacheRead: 1,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  // API: hf:zai-org/GLM-5.2 → ctx=524288, out=65536
  // Reasoning: GLM-5.2 has only two effective levels — `max` (default, highest) and `high`
  // (lower). Per the GLM-5.2 chat template: unset -> max; "high" -> high; every other value
  // ("low", "medium", ...) falls through to max. So `max > high`.
  // (https://docs.sglang.io/cookbook/autoregressive/GLM/GLM-5.2#hw=h200&variant=default&quant=fp8&strategy=low-latency&nodes=single)
  //
  // The Synthetic OpenAI shim validates `reasoning_effort` to the OpenAI enum and rejects
  // literal `max` (and `xhigh` errors). To expose both tiers through Pi we map:
  //   off    -> "none"      (disable thinking)
  //   high   -> "high"       (High, lower)
  //   xhigh  -> "medium"     (falls through to Max, highest)
  // minimal/low/medium are hidden (null) so Pi's named levels aren't remapped unexpectedly.
  {
    id: "hf:zai-org/GLM-5.2",
    name: "zai-org/GLM-5.2",
    provider: "synthetic",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "medium",
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
  // API: hf:zai-org/GLM-4.7-Flash → ctx=196608
  {
    id: "hf:zai-org/GLM-4.7-Flash",
    name: "zai-org/GLM-4.7-Flash",
    provider: "synthetic",
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
  // API: hf:openai/gpt-oss-120b → ctx=131072, out=65536
  {
    id: "hf:openai/gpt-oss-120b",
    name: "openai/gpt-oss-120b",
    provider: "synthetic",
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
  // API: hf:moonshotai/Kimi-K2.6 → ctx=262144, out=65536
  {
    id: "hf:moonshotai/Kimi-K2.6",
    name: "moonshotai/Kimi-K2.6",
    provider: "synthetic",
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
      input: 0.95,
      output: 4,
      cacheRead: 0.95,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:Qwen/Qwen3.5-397B-A17B → ctx=262144, out=65536
  {
    id: "hf:Qwen/Qwen3.5-397B-A17B",
    name: "Qwen/Qwen3.5-397B-A17B",
    provider: "together",
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
      input: 0.6,
      output: 3.6,
      cacheRead: 0.6,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:Qwen/Qwen3.6-27B → ctx=262144, out=65536
  {
    id: "hf:Qwen/Qwen3.6-27B",
    name: "Qwen/Qwen3.6-27B",
    provider: "synthetic",
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
    provider: "synthetic",
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
    provider: "synthetic",
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
