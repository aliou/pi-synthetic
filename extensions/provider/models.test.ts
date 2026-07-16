import { describe, expect, it } from "vitest";
import type { SyntheticApiModel } from "../../src/client/types";
import {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
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

function parsePrice(priceStr: string): number {
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  if (!match) return 0;
  const pricePerToken = Number.parseFloat(match[1]);
  return pricePerToken * 1_000_000;
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

    const apiInputCost = parsePrice(apiModel.pricing.prompt);
    const epsilon = 0.001;
    if (Math.abs(apiInputCost - hardcoded.cost.input) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.input",
        hardcoded: hardcoded.cost.input,
        api: apiInputCost,
      });
    }

    const apiOutputCost = parsePrice(apiModel.pricing.completion);
    if (Math.abs(apiOutputCost - hardcoded.cost.output) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.output",
        hardcoded: hardcoded.cost.output,
        api: apiOutputCost,
      });
    }

    const apiCacheReadCost = parsePrice(apiModel.pricing.input_cache_reads);
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
      if (model.id === "hf:MiniMaxAI/MiniMax-M3") {
        expect(compat?.maxTokensField).toBe("max_completion_tokens");
      } else {
        expect(compat?.maxTokensField).toBe("max_tokens");
      }
      if (model.reasoning) {
        expect(compat?.supportsReasoningEffort).toBe(true);
      }
    }
  });

  it("buildSyntheticProviderModelsFromApi merges API data with static overrides", () => {
    const apiModels: SyntheticApiModel[] = [
      {
        id: "hf:MiniMaxAI/MiniMax-M3",
        name: "MiniMaxAI/MiniMax-M3",
        provider: "synthetic",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        context_length: 262144,
        max_output_length: 65536,
        pricing: {
          prompt: "$0.0000006",
          completion: "$0.0000012",
          input_cache_reads: "$0.0000006",
          input_cache_writes: "0",
        },
        supported_features: ["reasoning"],
      },
    ];

    const models = buildSyntheticProviderModelsFromApi(apiModels);
    expect(models).toHaveLength(1);

    const model = models[0];
    expect(model.id).toBe("hf:MiniMaxAI/MiniMax-M3");
    expect(model.cost.input).toBe(0.6);
    const compat = model.compat as Record<string, unknown> | undefined;
    expect(compat?.maxTokensField).toBe("max_completion_tokens");
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
