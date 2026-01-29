// Hardcoded models from Synthetic API
// Source: https://api.synthetic.new/openai/v1/models

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
}

export const SYNTHETIC_MODELS: SyntheticModelConfig[] = [
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
    maxTokens: 65536,
  },
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
    maxTokens: 65536,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
  {
    id: "hf:moonshotai/Kimi-K2-Instruct-0905",
    name: "moonshotai/Kimi-K2-Instruct-0905",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.2,
      output: 1.2,
      cacheRead: 1.2,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
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
    maxTokens: 4096,
  },
];
