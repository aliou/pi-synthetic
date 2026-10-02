import { describe, expect, it } from "vitest";
import type { SyntheticApiModel } from "../../src/client/types";
import {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
  parseApiPrice,
  type ReasoningReplay,
  SYNTHETIC_MODELS,
} from "./models";

interface Discrepancy {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

async function fetchApiModels(): Promise<SyntheticApiModel[]> {
  const response = await fetch("https://api.synthetic.new/openai/v1/models", {
    headers: {
      Referer: "https://github.com/aliou/pi-synthetic",
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: { data?: SyntheticApiModel[] } = await response.json();
  return data.data ?? [];
}

function compareModels(
  apiModels: SyntheticApiModel[],
  hardcodedModels: typeof SYNTHETIC_MODELS,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      discrepancies.push({
        model: hardcoded.id,
        field: "exists",
        hardcoded: true,
        api: false,
      });
      continue;
    }

    const apiInputs = [...apiModel.input_modalities].sort();
    const hardcodedInputs = [...hardcoded.input].sort();
    if (JSON.stringify(apiInputs) !== JSON.stringify(hardcodedInputs)) {
      discrepancies.push({
        model: hardcoded.id,
        field: "input",
        hardcoded: hardcodedInputs,
        api: apiInputs,
      });
    }

    if (apiModel.context_length !== hardcoded.contextWindow) {
      discrepancies.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.context_length,
      });
    }

    if (apiModel.max_output_length !== hardcoded.maxTokens) {
      discrepancies.push({
        model: hardcoded.id,
        field: "maxTokens",
        hardcoded: hardcoded.maxTokens,
        api: apiModel.max_output_length,
      });
    }

    const apiInputCost = parseApiPrice(apiModel.pricing.prompt);
    const epsilon = 0.001;
    if (Math.abs(apiInputCost - hardcoded.cost.input) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.input",
        hardcoded: hardcoded.cost.input,
        api: apiInputCost,
      });
    }

    const apiOutputCost = parseApiPrice(apiModel.pricing.completion);
    if (Math.abs(apiOutputCost - hardcoded.cost.output) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.output",
        hardcoded: hardcoded.cost.output,
        api: apiOutputCost,
      });
    }

    const apiCacheReadCost = parseApiPrice(apiModel.pricing.input_cache_reads);
    if (Math.abs(apiCacheReadCost - hardcoded.cost.cacheRead) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.cacheRead",
        hardcoded: hardcoded.cost.cacheRead,
        api: apiCacheReadCost,
      });
    }

    if (apiModel.supported_features !== undefined) {
      const apiSupportsReasoning =
        apiModel.supported_features.includes("reasoning");
      if (apiSupportsReasoning !== hardcoded.reasoning) {
        discrepancies.push({
          model: hardcoded.id,
          field: "reasoning",
          hardcoded: hardcoded.reasoning,
          api: apiSupportsReasoning,
        });
      }
    }
  }

  for (const apiModel of apiModels) {
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (!hardcoded) {
      discrepancies.push({
        model: apiModel.id,
        field: "exists",
        hardcoded: false,
        api: true,
      });
    }
  }

  return discrepancies;
}

describe("Synthetic models", () => {
  it("should match API model definitions", { timeout: 30000 }, async () => {
    const apiModels = await fetchApiModels();
    const discrepancies = compareModels(apiModels, SYNTHETIC_MODELS);

    if (discrepancies.length > 0) {
      console.error("\nModel discrepancies found:");
      console.error("==========================");
      for (const d of discrepancies) {
        if (d.field === "exists") {
          if (d.hardcoded) {
            console.error(`  ${d.model}: Missing from API`);
          } else {
            console.error(`  ${d.model}: Missing from hardcoded models (NEW)`);
          }
        } else {
          console.error(`  ${d.model}.${d.field}:`);
          console.error(`    hardcoded: ${JSON.stringify(d.hardcoded)}`);
          console.error(`    api:       ${JSON.stringify(d.api)}`);
        }
      }
      console.error("==========================\n");
    }

    expect(discrepancies).toHaveLength(0);
  });

  it("buildSyntheticProviderModels returns the static catalog with defaults", () => {
    const models = buildSyntheticProviderModels();
    expect(models.length).toBe(SYNTHETIC_MODELS.length);
    for (const model of models) {
      const compat = model.compat as Record<string, unknown> | undefined;
      expect(compat?.supportsDeveloperRole).toBe(false);
      expect(compat?.maxTokensField).toBe("max_tokens");
      if (model.reasoning) {
        expect(compat?.supportsReasoningEffort).toBe(true);
      }
    }
  });

  it("enables strict tool mode by default while letting per-model overrides win", () => {
    for (const model of buildSyntheticProviderModels()) {
      const compat = model.compat as Record<string, unknown> | undefined;
      expect(compat?.supportsStrictMode).toBe(true);
    }

    const apiModels: SyntheticApiModel[] = [
      {
        id: "hf:new/model",
        name: "new/model",
        provider: "synthetic",
        input_modalities: ["text"],
        output_modalities: ["text"],
        context_length: 128000,
        max_output_length: 32768,
        pricing: {
          prompt: "$0.000001",
          completion: "$0.000002",
          input_cache_reads: "$0.000001",
          input_cache_writes: "0",
        },
        supported_features: ["reasoning"],
      },
    ];
    const apiCompat = buildSyntheticProviderModelsFromApi(apiModels)[0]
      ?.compat as Record<string, unknown> | undefined;
    expect(apiCompat?.supportsStrictMode).toBe(true);

    const stored = [
      {
        id: "hf:strict-off/model",
        name: "strict-off/model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.1, output: 0.4, cacheRead: 0.02, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 32768,
        compat: { supportsStrictMode: false },
      },
    ];
    const storeCompat = buildSyntheticProviderModelsFromStore(stored)[0]
      ?.compat as Record<string, unknown> | undefined;
    expect(storeCompat?.supportsStrictMode).toBe(false);
  });

  it("buildSyntheticProviderModelsFromApi merges API data with static overrides", () => {
    const apiModels: SyntheticApiModel[] = [
      {
        id: "hf:moonshotai/Kimi-K3",
        name: "moonshotai/Kimi-K3",
        provider: "synthetic",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        context_length: 524288,
        max_output_length: 65536,
        pricing: {
          prompt: "$0.000003",
          completion: "$0.000015",
          input_cache_reads: "$0.00000045",
          input_cache_writes: "0",
        },
        supported_features: ["reasoning"],
      },
    ];

    const models = buildSyntheticProviderModelsFromApi(apiModels);
    expect(models).toHaveLength(1);

    const model = models[0];
    expect(model.id).toBe("hf:moonshotai/Kimi-K3");
    expect(model.cost.input).toBe(3);
    expect(model.cost.cacheRead).toBeCloseTo(0.45);
    expect(model.thinkingLevelMap?.max).toBe("max");
    const compat = model.compat as Record<string, unknown> | undefined;
    expect(compat?.supportsReasoningEffort).toBe(true);
  });

  it("buildSyntheticProviderModelsFromApi preserves unknown API models", () => {
    const apiModels: SyntheticApiModel[] = [
      {
        id: "hf:new/model",
        name: "new/model",
        provider: "synthetic",
        input_modalities: ["text"],
        output_modalities: ["text"],
        context_length: 128000,
        max_output_length: 32768,
        pricing: {
          prompt: "$0.000001",
          completion: "$0.000002",
          input_cache_reads: "$0.000001",
          input_cache_writes: "0",
        },
        supported_features: ["reasoning"],
      },
    ];

    const models = buildSyntheticProviderModelsFromApi(apiModels);
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("hf:new/model");
    const compat = models[0]?.compat as Record<string, unknown> | undefined;
    expect(compat?.supportsReasoningEffort).toBe(true);
  });
});

describe("reasoningReplay catalog decisions", () => {
  /**
   * Expected reasoningReplay knob per catalog id (undefined = none).
   * Exhaustive on purpose: catalog changes must update this table.
   */
  const EXPECTED_REASONING_REPLAY: Record<string, ReasoningReplay | undefined> =
    {
      "syn:large:text": { field: "reasoning_content" },
      "syn:small:text": undefined,
      "syn:large:vision": undefined,
      "syn:small:vision": undefined,
      "hf:openai/gpt-oss-120b": undefined,
      "hf:zai-org/GLM-5.3": undefined,
      "hf:zai-org/GLM-5.3-Flash": {
        field: "reasoning_content",
        templateKwargs: { clear_thinking: false },
      },
      "hf:zai-org/GLM-4.7-Flash": undefined,
      "hf:deepseek-ai/DeepSeek-V4.1-Flash": { field: "reasoning_content" },
      "hf:moonshotai/Kimi-K3": undefined,
      "hf:Qwen/Qwen3.8-27B": undefined,
      "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4": undefined,
    };

  it("covers every catalog entry exactly once", () => {
    expect(Object.keys(EXPECTED_REASONING_REPLAY).sort()).toEqual(
      SYNTHETIC_MODELS.map((model) => model.id).sort(),
    );
    expect(SYNTHETIC_MODELS.length).toBe(12);
  });

  it("stamps the verified knob shape on every entry", () => {
    for (const model of SYNTHETIC_MODELS) {
      expect(model.reasoningReplay).toEqual(
        EXPECTED_REASONING_REPLAY[model.id],
      );
    }
  });

  it("knob carriers are exactly the three verified broken-template models", () => {
    expect(
      SYNTHETIC_MODELS.filter((model) => model.reasoningReplay).map(
        (model) => model.id,
      ),
    ).toEqual([
      "syn:large:text",
      "hf:zai-org/GLM-5.3-Flash",
      "hf:deepseek-ai/DeepSeek-V4.1-Flash",
    ]);
  });

  it("never sets requiresReasoningContentOnAssistantMessages", () => {
    for (const model of SYNTHETIC_MODELS) {
      const compat = model.compat as Record<string, unknown> | undefined;
      expect(
        compat?.requiresReasoningContentOnAssistantMessages,
        model.id,
      ).toBeUndefined();
    }
  });

  it("API-sourced models inherit the knob from the static override", () => {
    const apiModels: SyntheticApiModel[] = [
      {
        id: "hf:deepseek-ai/DeepSeek-V4.1-Flash",
        name: "deepseek-ai/DeepSeek-V4.1-Flash",
        provider: "synthetic",
        input_modalities: ["text"],
        output_modalities: ["text"],
        context_length: 524288,
        max_output_length: 65536,
        pricing: {
          prompt: "$0.000001",
          completion: "$0.000002",
          input_cache_reads: "$0.000001",
          input_cache_writes: "0",
        },
        supported_features: ["reasoning"],
      },
    ];

    const models = buildSyntheticProviderModelsFromApi(apiModels);
    expect(models).toHaveLength(1);
    expect(models[0]?.reasoningReplay).toEqual({
      field: "reasoning_content",
    });
  });

  it("keeps persisted knobs on store-sourced models without a static override", () => {
    const stored: Array<
      Parameters<typeof buildSyntheticProviderModelsFromStore>[0][number]
    > = [
      {
        id: "syn:established/model",
        name: "established/model",
        reasoning: true,
        input: ["text"],
        cost: { input: 0.1, output: 0.4, cacheRead: 0.02, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 32768,
        reasoningReplay: { field: "reasoning_content" },
      },
    ];

    const models = buildSyntheticProviderModelsFromStore(stored);
    expect(models).toHaveLength(1);
    expect(models[0]?.reasoningReplay).toEqual({ field: "reasoning_content" });
  });
});
