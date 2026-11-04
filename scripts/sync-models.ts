import type { SyntheticApiModel } from "../src/client/types";
import {
  parseApiPrice,
  SYNTHETIC_MODELS,
  type SyntheticModel,
} from "../src/models";

const API_URL = "https://api.synthetic.new/openai/v1/models";
const EPSILON = 0.001;

interface Difference {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

const PRICE_FIELDS = new Set(["cost.input", "cost.output", "cost.cacheRead"]);

function isPriceDifference(d: Difference): boolean {
  return PRICE_FIELDS.has(d.field);
}

function isNewModel(d: Difference): boolean {
  return d.field === "exists" && d.api === true;
}

async function fetchApiModels(): Promise<SyntheticApiModel[]> {
  const response = await fetch(API_URL, {
    headers: { Referer: "https://github.com/aliou/pi-synthetic" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`,
    );
  }

  const data: { data?: SyntheticApiModel[] } = await response.json();
  return data.data ?? [];
}

function compare(
  apiModels: SyntheticApiModel[],
  hardcodedModels: SyntheticModel[],
): Difference[] {
  const differences: Difference[] = [];

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      differences.push({
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
      differences.push({
        model: hardcoded.id,
        field: "input",
        hardcoded: hardcodedInputs,
        api: apiInputs,
      });
    }

    if (apiModel.context_length !== hardcoded.contextWindow) {
      differences.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.context_length,
      });
    }

    if (apiModel.max_output_length !== hardcoded.maxTokens) {
      differences.push({
        model: hardcoded.id,
        field: "maxTokens",
        hardcoded: hardcoded.maxTokens,
        api: apiModel.max_output_length,
      });
    }

    const apiInputCost = parseApiPrice(apiModel.pricing.prompt);
    if (Math.abs(apiInputCost - hardcoded.cost.input) > EPSILON) {
      differences.push({
        model: hardcoded.id,
        field: "cost.input",
        hardcoded: hardcoded.cost.input,
        api: apiInputCost,
      });
    }

    const apiOutputCost = parseApiPrice(apiModel.pricing.completion);
    if (Math.abs(apiOutputCost - hardcoded.cost.output) > EPSILON) {
      differences.push({
        model: hardcoded.id,
        field: "cost.output",
        hardcoded: hardcoded.cost.output,
        api: apiOutputCost,
      });
    }

    // The catalog stores the API's input_cache_reads price directly (see the
    // header comment in src/models.ts), so compare as-is.
    const apiCacheReadCost = parseApiPrice(apiModel.pricing.input_cache_reads);
    if (Math.abs(apiCacheReadCost - hardcoded.cost.cacheRead) > EPSILON) {
      differences.push({
        model: hardcoded.id,
        field: "cost.cacheRead",
        hardcoded: hardcoded.cost.cacheRead,
        api: apiCacheReadCost,
      });
    }

    const apiReasoning =
      apiModel.supported_features?.includes("reasoning") ?? false;
    if (apiReasoning !== hardcoded.reasoning) {
      differences.push({
        model: hardcoded.id,
        field: "reasoning",
        hardcoded: hardcoded.reasoning,
        api: apiReasoning,
      });
    }
  }

  for (const apiModel of apiModels) {
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (!hardcoded) {
      differences.push({
        model: apiModel.id,
        field: "exists",
        hardcoded: false,
        api: true,
      });
    }
  }

  return differences;
}

function formatTable(differences: Difference[]): string {
  const lines: string[] = [
    "| Model | Field | Hardcoded | API |",
    "|---|---|---|---|",
  ];

  for (const d of differences) {
    if (d.field === "exists") {
      if (d.hardcoded) {
        lines.push(`| ${d.model} | exists | in catalog | missing from API |`);
      } else {
        lines.push(
          `| ${d.model} | exists | missing from catalog | in API (new model) |`,
        );
      }
    } else {
      lines.push(
        `| ${d.model} | ${d.field} | ${JSON.stringify(d.hardcoded)} | ${JSON.stringify(d.api)} |`,
      );
    }
  }

  return lines.join("\n");
}

function formatSection(
  title: string,
  body: string,
  differences: Difference[],
  note: string,
): string {
  return [`## ${title}`, "", body, "", formatTable(differences), "", note].join(
    "\n",
  );
}

async function main(): Promise<void> {
  const apiModels = await fetchApiModels();
  const differences = compare(apiModels, SYNTHETIC_MODELS);

  const priceChanges = differences.filter(isPriceDifference);
  const newModels = differences.filter(isNewModel);
  const other = differences.filter(
    (d) => !isPriceDifference(d) && !isNewModel(d),
  );

  const sections: string[] = [
    "Upstream Synthetic model changes detected.",
    "",
    `Compared against ${API_URL}. The hardcoded catalog stores the API's input_cache_reads price directly.`,
  ];

  if (priceChanges.length > 0) {
    const section = formatSection(
      "Price changes",
      "The upstream provider changed pricing for these models. Update the catalog so Pi reports correct costs.",
      priceChanges,
      "Update `cost.input` / `cost.output` / `cost.cacheRead` in `src/models.ts`.",
    );
    sections.push("", section);
  }

  if (newModels.length > 0) {
    const section = formatSection(
      "New upstream models",
      "These models are in the upstream API but missing from the catalog. Add them so they are selectable.",
      newModels,
      "Add entries to `SYNTHETIC_MODELS` in `src/models.ts`.",
    );
    sections.push("", section);
  }

  if (other.length > 0) {
    sections.push(
      "",
      formatSection(
        "Other drift",
        "Field-level drift that is neither a price change nor a new model.",
        other,
        "Update `src/models.ts` accordingly.",
      ),
    );
  }

  if (differences.length === 0) {
    console.log("No differences found between hardcoded catalog and API.");
    return;
  }

  console.log(sections.join("\n"));
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
