// Hardcoded models from Synthetic API
// Source: https://api.synthetic.new/openai/v1/models
// maxTokens sourced from https://models.dev/api.json (synthetic provider)

export interface SyntheticModelConfig {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  compat?: {
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    reasoningEffortMap?: Partial<
      Record<"minimal" | "low" | "medium" | "high" | "xhigh", string>
    >;
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresMistralToolIds?: boolean;
  };
}

const SYNTHETIC_REASONING_EFFORT_MAP = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
} as const;

export const SYNTHETIC_MODELS: SyntheticModelConfig[] = [
  // API: hf:zai-org/GLM-4.7 → ctx=202752, out=65536
  {
    id: "hf:zai-org/GLM-4.7",
    name: "zai-org/GLM-4.7",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
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
  // API: hf:zai-org/GLM-5 → ctx=196608, out=65536
  {
    id: "hf:zai-org/GLM-5",
    name: "zai-org/GLM-5",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
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
  // API: hf:zai-org/GLM-4.7-Flash → ctx=196608
  {
    id: "hf:zai-org/GLM-4.7-Flash",
    name: "zai-org/GLM-4.7-Flash",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
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
  // API: hf:MiniMaxAI/MiniMax-M2.1 → ctx=196608, out=65536
  {
    id: "hf:MiniMaxAI/MiniMax-M2.1",
    name: "MiniMaxAI/MiniMax-M2.1",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text"],
    cost: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.3,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  // models.dev: synthetic/hf:meta-llama/Llama-3.3-70B-Instruct → ctx=128000, out=32768
  {
    id: "hf:meta-llama/Llama-3.3-70B-Instruct",
    name: "meta-llama/Llama-3.3-70B-Instruct",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.88,
      output: 0.88,
      cacheRead: 0.88,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-R1-0528 → ctx=128000, out=128000
  {
    id: "hf:deepseek-ai/DeepSeek-R1-0528",
    name: "deepseek-ai/DeepSeek-R1-0528",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text"],
    cost: {
      input: 3,
      output: 8,
      cacheRead: 3,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 128000,
  },
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-V3.2 → ctx=162816, out=8000
  {
    id: "hf:deepseek-ai/DeepSeek-V3.2",
    name: "deepseek-ai/DeepSeek-V3.2",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.56,
      output: 1.68,
      cacheRead: 0.56,
      cacheWrite: 0,
    },
    contextWindow: 162816,
    maxTokens: 8000,
  },
  // models.dev: synthetic/hf:moonshotai/Kimi-K2-Instruct-0905 → ctx=262144, out=32768
  {
    id: "hf:moonshotai/Kimi-K2-Instruct-0905",
    name: "moonshotai/Kimi-K2-Instruct-0905",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.2,
      output: 1.2,
      cacheRead: 1.2,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 32768,
  },
  // models.dev: synthetic/hf:moonshotai/Kimi-K2-Thinking → ctx=262144, out=262144
  {
    id: "hf:moonshotai/Kimi-K2-Thinking",
    name: "moonshotai/Kimi-K2-Thinking",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text"],
    cost: {
      input: 0.6,
      output: 2.5,
      cacheRead: 0.6,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 262144,
  },
  // models.dev: synthetic/hf:openai/gpt-oss-120b → ctx=128000, out=32768
  {
    id: "hf:openai/gpt-oss-120b",
    name: "openai/gpt-oss-120b",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.1,
      output: 0.1,
      cacheRead: 0.1,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  // API: hf:Qwen/Qwen3-Coder-480B-A35B-Instruct → ctx=262144, out=65536
  {
    id: "hf:Qwen/Qwen3-Coder-480B-A35B-Instruct",
    name: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text"],
    cost: {
      input: 2,
      output: 2,
      cacheRead: 2,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:moonshotai/Kimi-K2.5 → ctx=262144, out=65536
  {
    id: "hf:moonshotai/Kimi-K2.5",
    name: "moonshotai/Kimi-K2.5",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text", "image"],
    cost: {
      input: 0.45,
      output: 3.4,
      cacheRead: 0.45,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // API: hf:nvidia/Kimi-K2.5-NVFP4 → ctx=262144, out=65536 (NVFP4 quantized)
  {
    id: "hf:nvidia/Kimi-K2.5-NVFP4",
    name: "nvidia/Kimi-K2.5-NVFP4",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text", "image"],
    cost: {
      input: 0.45,
      output: 3.4,
      cacheRead: 0.45,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-V3 → ctx=128000, out=128000
  {
    id: "hf:deepseek-ai/DeepSeek-V3",
    name: "deepseek-ai/DeepSeek-V3",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.25,
      output: 1.25,
      cacheRead: 1.25,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 128000,
  },
  // models.dev: synthetic/hf:Qwen/Qwen3-235B-A22B-Thinking-2507 → ctx=256000, out=32000
  {
    id: "hf:Qwen/Qwen3-235B-A22B-Thinking-2507",
    name: "Qwen/Qwen3-235B-A22B-Thinking-2507",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
    },
    input: ["text"],
    cost: {
      input: 0.65,
      output: 3,
      cacheRead: 0.65,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 32000,
  },
  // API: hf:Qwen/Qwen3.5-397B-A17B → ctx=262144, out=65536
  {
    id: "hf:Qwen/Qwen3.5-397B-A17B",
    name: "Qwen/Qwen3.5-397B-A17B",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
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
  // API: hf:MiniMaxAI/MiniMax-M2.5 → ctx=191488, out=65536
  {
    id: "hf:MiniMaxAI/MiniMax-M2.5",
    name: "MiniMaxAI/MiniMax-M2.5",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.4,
      output: 2,
      cacheRead: 0.4,
      cacheWrite: 0,
    },
    contextWindow: 191488,
    maxTokens: 65536,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
      maxTokensField: "max_completion_tokens",
    },
  },
  // API: hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4 → ctx=262144, out=65536
  {
    id: "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    name: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    reasoning: true,
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: SYNTHETIC_REASONING_EFFORT_MAP,
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
