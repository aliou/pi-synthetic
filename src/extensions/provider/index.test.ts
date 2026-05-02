import { describe, expect, it } from "vitest";
import { buildSyntheticProviderModels } from "./index";
import { SYNTHETIC_MODELS } from "./models";

describe("buildSyntheticProviderModels", () => {
  it("excludes proxied models when includeProxiedModels is false", () => {
    const models = buildSyntheticProviderModels(false);
    for (const model of models) {
      const source = SYNTHETIC_MODELS.find((m) => m.id === model.id);
      expect(source).toBeDefined();
      expect(source?.provider).toBe("synthetic");
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
    const miniMax = models.find((m) => m.id === "hf:MiniMaxAI/MiniMax-M2.5");
    expect(miniMax).toBeDefined();
    expect(miniMax?.compat).toMatchObject({
      supportsDeveloperRole: false,
      maxTokensField: "max_completion_tokens",
    });
  });
});
