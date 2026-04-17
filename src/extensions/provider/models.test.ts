import { describe, expect, it } from "vitest";
import { SYNTHETIC_MODELS } from "./models";

interface ApiModel {
  id: string;
  name: string;
  provider: string | null;
  input_modalities: string[];
  output_modalities: string[];
  context_length: number;
  max_output_length: number;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_reads: string;
    input_cache_writes: string;
  };
  supported_features?: string[];
}

interface ApiResponse {
  data: ApiModel[];
}

interface Discrepancy {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

async function fetchApiModels(): Promise<ApiModel[]> {
  // Making ourselves known
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

  const data: ApiResponse = await response.json();
  return data.data;
}

function parsePrice(priceStr: string): number {
  // Convert "$0.0000006" to 0.6 (dollars per million tokens)
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  if (!match) return 0;
  const pricePerToken = Number.parseFloat(match[1]);
  // API prices are per token, hardcoded prices are per million tokens
  return pricePerToken * 1_000_000;
}

function compareModels(
  apiModels: ApiModel[],
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

    // Check input modalities (text vs image support)
    const apiInputs = apiModel.input_modalities.sort();
    const hardcodedInputs = [...hardcoded.input].sort();
    if (JSON.stringify(apiInputs) !== JSON.stringify(hardcodedInputs)) {
      discrepancies.push({
        model: hardcoded.id,
        field: "input",
        hardcoded: hardcodedInputs,
        api: apiInputs,
      });
    }

    // Check context window
    if (apiModel.context_length !== hardcoded.contextWindow) {
      discrepancies.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.context_length,
      });
    }

    // Check max output tokens (skip if API doesn't provide it)
    if (
      apiModel.max_output_length !== undefined &&
      apiModel.max_output_length !== hardcoded.maxTokens
    ) {
      discrepancies.push({
        model: hardcoded.id,
        field: "maxTokens",
        hardcoded: hardcoded.maxTokens,
        api: apiModel.max_output_length,
      });
    }

    // Check input cost (convert API price to per-million rate)
    const apiInputCost = parsePrice(apiModel.pricing.prompt);
    const epsilon = 0.001; // Small tolerance for floating point
    if (Math.abs(apiInputCost - hardcoded.cost.input) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.input",
        hardcoded: hardcoded.cost.input,
        api: apiInputCost,
      });
    }

    // Check output cost
    const apiOutputCost = parsePrice(apiModel.pricing.completion);
    if (Math.abs(apiOutputCost - hardcoded.cost.output) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.output",
        hardcoded: hardcoded.cost.output,
        api: apiOutputCost,
      });
    }

    // Check cache read cost
    const apiCacheReadCost = parsePrice(apiModel.pricing.input_cache_reads);
    if (Math.abs(apiCacheReadCost - hardcoded.cost.cacheRead) > epsilon) {
      discrepancies.push({
        model: hardcoded.id,
        field: "cost.cacheRead",
        hardcoded: hardcoded.cost.cacheRead,
        api: apiCacheReadCost,
      });
    }

    // Check reasoning capability from supported_features (skip if API doesn't provide it)
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

    // Check provider
    if (
      apiModel.provider !== null &&
      apiModel.provider !== hardcoded.provider
    ) {
      discrepancies.push({
        model: hardcoded.id,
        field: "provider",
        hardcoded: hardcoded.provider,
        api: apiModel.provider,
      });
    }
  }

  // Check for API models not in hardcoded list
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
});
