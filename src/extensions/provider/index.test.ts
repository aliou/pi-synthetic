import { describe, expect, it } from "vitest";
import { buildSyntheticProviderModels } from "./index";
import { isAlias, SYNTHETIC_MODELS } from "./models";

describe("buildSyntheticProviderModels", () => {
  it("excludes proxied models when includeProxiedModels is false", () => {
    const models = buildSyntheticProviderModels(false);
    for (const model of models) {
      const source = SYNTHETIC_MODELS.find((m) => m.id === model.id);
      expect(source).toBeDefined();
    }
  });

  it("includes all models when includeProxiedModels is true", () => {
    const models = buildSyntheticProviderModels(true);
    expect(models).toHaveLength(SYNTHETIC_MODELS.length);
  });

  it("does not expose the internal provider field", () => {
    const models = buildSyntheticProviderModels(true);
    for (const model of models) {
      expect(model).not.toHaveProperty("provider");
    }
  });

  it("sets default compat fields on every model", () => {
    const models = buildSyntheticProviderModels(true);
    for (const model of models) {
      expect(model.compat).toMatchObject({
        supportsDeveloperRole: false,
      });
      expect(model.compat).toHaveProperty("maxTokensField");
    }
  });

  it("preserves model-specific compat overrides", () => {
    const models = buildSyntheticProviderModels(true);
    const miniMax = models.find((m) => m.id === "hf:MiniMaxAI/MiniMax-M3");
    expect(miniMax).toBeDefined();
    expect(miniMax?.compat).toMatchObject({
      supportsDeveloperRole: false,
      maxTokensField: "max_completion_tokens",
    });
  });

  it("resolves every alias entry from its target model", () => {
    const models = buildSyntheticProviderModels(true);
    const byId = new Map(models.map((m) => [m.id, m]));

    for (const alias of SYNTHETIC_MODELS.filter((m) => isAlias(m))) {
      const resolved = byId.get(alias.id);
      const target = byId.get(alias.aliasFor);

      expect(resolved, `alias "${alias.id}" should be resolved`).toBeDefined();
      expect(
        target,
        `alias "${alias.id}" target should be present`,
      ).toBeDefined();

      expect(resolved?.cost).toStrictEqual(target?.cost);
      expect(resolved?.contextWindow).toBe(target?.contextWindow);
      expect(resolved?.maxTokens).toBe(target?.maxTokens);
      expect(resolved?.thinkingLevelMap).toStrictEqual(
        target?.thinkingLevelMap,
      );
      expect(resolved?.compat).toStrictEqual(target?.compat);
    }
  });

  it("aliases are always visible even when proxied models are hidden", () => {
    // Aliases resolve with provider: "synthetic", so they survive the
    // proxiedModels filter regardless of the target's actual provider.
    const models = buildSyntheticProviderModels(false);
    const aliasIds = new Set(
      SYNTHETIC_MODELS.filter((m) => isAlias(m)).map((m) => m.id),
    );

    for (const aliasId of aliasIds) {
      const model = models.find((m) => m.id === aliasId);
      expect(model, `alias ${aliasId} should be present`).toBeDefined();
    }
  });
});
