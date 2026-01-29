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
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresMistralToolIds?: boolean;
  };
}

export const SYNTHETIC_MODELS: SyntheticModelConfig[] = [
  // models.dev: synthetic/hf:zai-org/GLM-4.7 → ctx=200000, out=64000
  {
    id: "hf:zai-org/GLM-4.7",
    name: "zai-org/GLM-4.7",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.55,
      output: 2.19,
      cacheRead: 0.55,
      cacheWrite: 0,
    },
    contextWindow: 202752,
    maxTokens: 64000,
  },
  // models.dev: synthetic/hf:MiniMaxAI/MiniMax-M2.1 → ctx=204800, out=131072
  {
    id: "hf:MiniMaxAI/MiniMax-M2.1",
    name: "MiniMaxAI/MiniMax-M2.1",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.55,
      output: 2.19,
      cacheRead: 0.55,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 131072,
  },
  // models.dev: synthetic/hf:meta-llama/Llama-3.3-70B-Instruct → ctx=128000, out=32768
  {
    id: "hf:meta-llama/Llama-3.3-70B-Instruct",
    name: "meta-llama/Llama-3.3-70B-Instruct",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.9,
      output: 0.9,
      cacheRead: 0.9,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-V3-0324 → ctx=128000, out=128000
  {
    id: "hf:deepseek-ai/DeepSeek-V3-0324",
    name: "deepseek-ai/DeepSeek-V3-0324",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.2,
      output: 1.2,
      cacheRead: 1.2,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 128000,
  },
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-R1-0528 → ctx=128000, out=128000
  {
    id: "hf:deepseek-ai/DeepSeek-R1-0528",
    name: "deepseek-ai/DeepSeek-R1-0528",
    reasoning: true,
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
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-V3.1 → ctx=128000, out=128000
  {
    id: "hf:deepseek-ai/DeepSeek-V3.1",
    name: "deepseek-ai/DeepSeek-V3.1",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.56,
      output: 1.68,
      cacheRead: 0.56,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 128000,
  },
  // models.dev: synthetic/hf:deepseek-ai/DeepSeek-V3.1-Terminus → ctx=128000, out=128000
  {
    id: "hf:deepseek-ai/DeepSeek-V3.1-Terminus",
    name: "deepseek-ai/DeepSeek-V3.1-Terminus",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.2,
      output: 1.2,
      cacheRead: 1.2,
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
  // NOTE: not present in models.dev synthetic provider; maxTokens unchanged
  {
    id: "hf:Qwen/Qwen3-VL-235B-A22B-Instruct",
    name: "Qwen/Qwen3-VL-235B-A22B-Instruct",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.22,
      output: 0.88,
      cacheRead: 0.22,
      cacheWrite: 0,
    },
    contextWindow: 256000,
    maxTokens: 4096,
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
  // models.dev: synthetic/hf:Qwen/Qwen3-Coder-480B-A35B-Instruct → ctx=256000, out=32000
  {
    id: "hf:Qwen/Qwen3-Coder-480B-A35B-Instruct",
    name: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.45,
      output: 1.8,
      cacheRead: 0.45,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 32000,
  },
  // models.dev: synthetic/hf:Qwen/Qwen3-235B-A22B-Instruct-2507 → ctx=256000, out=32000
  {
    id: "hf:Qwen/Qwen3-235B-A22B-Instruct-2507",
    name: "Qwen/Qwen3-235B-A22B-Instruct-2507",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.22,
      output: 0.88,
      cacheRead: 0.22,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 32000,
  },
  // models.dev: synthetic/hf:zai-org/GLM-4.6 → ctx=200000, out=64000
  {
    id: "hf:zai-org/GLM-4.6",
    name: "zai-org/GLM-4.6",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.55,
      output: 2.19,
      cacheRead: 0.55,
      cacheWrite: 0,
    },
    contextWindow: 202752,
    maxTokens: 64000,
  },
  // models.dev: synthetic/hf:MiniMaxAI/MiniMax-M2 → ctx=196608, out=131000
  {
    id: "hf:MiniMaxAI/MiniMax-M2",
    name: "MiniMaxAI/MiniMax-M2",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.3,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 131000,
  },
  // models.dev: synthetic/hf:moonshotai/Kimi-K2.5 → ctx=262144, out=65536
  {
    id: "hf:moonshotai/Kimi-K2.5",
    name: "moonshotai/Kimi-K2.5",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 1.2,
      output: 1.2,
      cacheRead: 1.2,
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
];
