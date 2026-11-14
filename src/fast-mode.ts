import type { ModelCost, ModelCostTier } from "@earendil-works/pi-ai";
import type { SyntheticModel } from "./models";

export const FAST_MULTIPLIER = 2;

export const FAST_MODEL_PREFIX = "fast:";

export interface FastModeRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function scaleRates(rates: FastModeRates, factor: number): FastModeRates {
  return {
    input: rates.input * factor,
    output: rates.output * factor,
    cacheRead: rates.cacheRead * factor,
    cacheWrite: rates.cacheWrite * factor,
  };
}

function scaleTiers(tiers: ModelCostTier[], factor: number): ModelCostTier[] {
  return tiers.map((tier) => ({ ...tier, ...scaleRates(tier, factor) }));
}

export function isFastModeModelId(modelId: string): boolean {
  return modelId.startsWith(FAST_MODEL_PREFIX);
}

export function toFastModel<T extends { id: string; cost: ModelCost }>(
  model: T,
): T {
  if (isFastModeModelId(model.id)) return model;
  return {
    ...model,
    id: `${FAST_MODEL_PREFIX}${model.id}`,
    cost: {
      ...scaleRates(model.cost, FAST_MULTIPLIER),
      ...(model.cost.tiers
        ? { tiers: scaleTiers(model.cost.tiers, FAST_MULTIPLIER) }
        : {}),
    },
  };
}

export function toBareModel<T extends { id: string; cost: ModelCost }>(
  model: T,
): T {
  if (!isFastModeModelId(model.id)) return model;
  return {
    ...model,
    id: model.id.slice(FAST_MODEL_PREFIX.length),
    cost: {
      ...scaleRates(model.cost, 1 / FAST_MULTIPLIER),
      ...(model.cost.tiers
        ? { tiers: scaleTiers(model.cost.tiers, 1 / FAST_MULTIPLIER) }
        : {}),
    },
  };
}

export function buildFastModeModels(
  models: SyntheticModel[],
): SyntheticModel[] {
  return models.map((model) => ({
    ...toFastModel(model),
    name: `${FAST_MODEL_PREFIX}${model.name}`,
  }));
}
