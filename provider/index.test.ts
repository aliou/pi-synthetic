import { createModels, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { toOpenAiCompletionsModels } from "../src/api/openai-completions";
import type { SyntheticApiModel } from "../src/client/types";
import { SYNTHETIC_ANTHROPIC_BASE_URL } from "../src/constants";
import {
  buildSyntheticProviderModelsFromApi,
  SYNTHETIC_MODELS,
} from "../src/models";
import createSyntheticProvider from "./index";

const apiModel: SyntheticApiModel = {
  id: "hf:test/new-model",
  name: "hf:test/new-model",
  provider: "synthetic",
  hugging_face_id: "test/new-model",
  input_modalities: ["text"],
  output_modalities: ["text"],
  context_length: 262144,
  max_output_length: 65536,
  pricing: {
    prompt: "$0.000001",
    completion: "$0.000002",
    input_cache_reads: "$0.0000001",
    input_cache_writes: "0",
  },
  supported_features: ["reasoning"],
};

function stubModelsResponse(models: SyntheticApiModel[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ data: models, has_more: false }, { status: 200 }),
    ),
  );
}

const REQUIRED_FIELDS = [
  "id",
  "name",
  "provider",
  "api",
  "baseUrl",
  "input",
  "cost",
  "contextWindow",
  "maxTokens",
] as const;

describe("createSyntheticProvider", () => {
  it("lists the baseline catalog without credentials", () => {
    const provider = createSyntheticProvider();

    expect(provider.id).toBe("synthetic");
    const models = provider.getModels();
    expect(models).toHaveLength(SYNTHETIC_MODELS.length);
    for (const model of models) {
      for (const field of REQUIRED_FIELDS) {
        expect(model[field]).toBeDefined();
      }
      if (model.reasoning) {
        expect(model.thinkingLevelMap).toBeDefined();
      }
    }
  });

  it("stamps models for the configured api surface", () => {
    const provider = createSyntheticProvider({ api: "anthropic-messages" });

    const model = provider.getModels()[0];
    expect(model?.api).toBe("anthropic-messages");
    expect(model?.baseUrl).toBe(SYNTHETIC_ANTHROPIC_BASE_URL);
  });

  it("persists a fetched catalog through a models store", async () => {
    stubModelsResponse([apiModel]);
    const store = new InMemoryModelsStore();
    const models = createModels({ modelsStore: store });
    models.setProvider(createSyntheticProvider());

    const result = await models.refresh({ force: true });

    expect(result.errors.size).toBe(0);
    const entry = await store.read("synthetic");
    expect(entry?.models.some((model) => model.id === apiModel.id)).toBe(true);
    expect(entry?.checkedAt).toBeDefined();
  });

  it("serves a stored catalog on offline refresh and lists it without credentials", async () => {
    const stored = toOpenAiCompletionsModels(
      buildSyntheticProviderModelsFromApi([apiModel]),
    );
    const store = new InMemoryModelsStore();
    await store.write("synthetic", { models: stored, checkedAt: Date.now() });

    const fetchSpy = vi.fn().mockRejectedValue(new Error("should not fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    const models = createModels({ modelsStore: store });
    models.setProvider(createSyntheticProvider());

    const result = await models.refresh({ allowNetwork: false });

    expect(result.errors.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const listed = models.getModels("synthetic");
    expect(listed.some((model) => model.id === apiModel.id)).toBe(true);
    for (const model of listed) {
      for (const field of REQUIRED_FIELDS) {
        expect(model[field]).toBeDefined();
      }
    }
  });

  it("keeps the baseline catalog when the catalog fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const models = createModels();
    models.setProvider(createSyntheticProvider());

    const result = await models.refresh({ force: true });

    expect(result.errors.has("synthetic")).toBe(true);
    expect(models.getModels("synthetic")).toHaveLength(SYNTHETIC_MODELS.length);
  });
});
