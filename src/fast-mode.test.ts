import { describe, expect, it } from "vitest";
import {
  buildFastModeModels,
  FAST_MULTIPLIER,
  isFastModeModelId,
  toBareModel,
  toFastModel,
} from "./fast-mode";
import type { SyntheticModel } from "./models";

const model: SyntheticModel = {
  id: "syn:small:text",
  name: "syn:small:text",
  reasoning: true,
  input: ["text"],
  cost: {
    input: 0.6,
    output: 1.2,
    cacheRead: 0.03,
    cacheWrite: 0.12,
    tiers: [
      {
        inputTokensAbove: 200000,
        input: 0.3,
        output: 0.6,
        cacheRead: 0.015,
        cacheWrite: 0.06,
      },
    ],
  },
  contextWindow: 196608,
  maxTokens: 65536,
};

describe("toFastModel", () => {
  it("prefixes the model id and multiplies every cost rate", () => {
    const fast = toFastModel(model);
    expect(fast.id).toBe(`fast:${model.id}`);
    expect(fast.name).toBe(model.name);
    expect(fast.cost.input).toBe(model.cost.input * FAST_MULTIPLIER);
    expect(fast.cost.output).toBe(model.cost.output * FAST_MULTIPLIER);
    expect(fast.cost.cacheRead).toBe(model.cost.cacheRead * FAST_MULTIPLIER);
    expect(fast.cost.cacheWrite).toBe(model.cost.cacheWrite * FAST_MULTIPLIER);
  });

  it("multiplies tier rates and keeps thresholds", () => {
    const fast = toFastModel(model);
    const tier = fast.cost.tiers?.[0];
    expect(tier?.inputTokensAbove).toBe(200000);
    expect(tier?.input).toBe(0.3 * FAST_MULTIPLIER);
    expect(tier?.cacheRead).toBe(0.015 * FAST_MULTIPLIER);
  });

  it("does not mutate the input model", () => {
    toFastModel(model);
    expect(model.id).toBe("syn:small:text");
    expect(model.cost.input).toBe(0.6);
  });

  it("is idempotent on already-fast models", () => {
    const once = toFastModel(model);
    const twice = toFastModel(once);
    expect(twice.id).toBe(`fast:${model.id}`);
    expect(twice.cost.input).toBe(model.cost.input * FAST_MULTIPLIER);
  });
});

describe("toBareModel", () => {
  it("round-trips a fast model back to bare with original costs", () => {
    const bare = toBareModel(toFastModel(model));
    expect(bare.id).toBe(model.id);
    expect(bare.cost.input).toBe(model.cost.input);
    expect(bare.cost.cacheRead).toBeCloseTo(model.cost.cacheRead);
    expect(bare.cost.tiers?.[0]?.input).toBeCloseTo(0.3);
  });

  it("leaves bare models untouched", () => {
    expect(toBareModel(model).id).toBe(model.id);
  });
});

describe("buildFastModeModels", () => {
  it("derives fast catalog entries with prefixed ids and doubled costs", () => {
    const [fast] = buildFastModeModels([model]);
    expect(fast?.id).toBe("fast:syn:small:text");
    expect(fast?.name).toBe("fast:syn:small:text");
    expect(fast?.cost.input).toBe(model.cost.input * FAST_MULTIPLIER);
    expect(fast?.cost.cacheRead).toBe(model.cost.cacheRead * FAST_MULTIPLIER);
  });

  it("leaves regular models untouched", () => {
    const [fast] = buildFastModeModels([model]);
    expect(model.id).toBe("syn:small:text");
    expect(fast).not.toBe(model);
  });
});

describe("isFastModeModelId", () => {
  it("detects the fast prefix", () => {
    expect(isFastModeModelId("fast:syn:small:text")).toBe(true);
    expect(isFastModeModelId("syn:small:text")).toBe(false);
  });
});
