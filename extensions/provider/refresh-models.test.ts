import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { SyntheticApiModel } from "../../src/client/types";
import {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
  SYNTHETIC_MODELS,
} from "./models";
import { createSyntheticRefreshModels } from "./refresh-models";

const MODEL_STORE_TTL_MS = 4 * 60 * 60 * 1000;

function createContext(
  options: {
    allowNetwork?: boolean;
    force?: boolean;
    credential?: { type: "api_key"; key: string };
    store?: { models?: unknown[]; checkedAt?: number };
  } = {},
): RefreshModelsContext {
  const written: Array<{ models: unknown[]; checkedAt: number }> = [];

  return {
    credential: options.credential,
    allowNetwork: options.allowNetwork ?? true,
    force: options.force ?? false,
    signal: new AbortController().signal,
    store: {
      read: vi.fn(async () =>
        options.store
          ? {
              models: options.store.models ?? [],
              checkedAt: options.store.checkedAt,
            }
          : undefined,
      ),
      write: vi.fn(async (entry) => {
        written.push({
          models: entry.models as unknown[],
          checkedAt: entry.checkedAt ?? 0,
        });
      }),
      delete: vi.fn(),
    },
    getWritten: () => written,
  } as unknown as RefreshModelsContext & {
    getWritten: () => Array<{ models: unknown[]; checkedAt: number }>;
  };
}

const apiModel: SyntheticApiModel = {
  id: "syn:large:text",
  name: "syn:large:text",
  provider: "synthetic",
  hugging_face_id: "zai-org/GLM-5.2",
  input_modalities: ["text"],
  output_modalities: ["text"],
  context_length: 524288,
  max_output_length: 65536,
  pricing: {
    prompt: "$0.0000014",
    completion: "$0.0000044",
    input_cache_reads: "$0.0000014",
    input_cache_writes: "0",
  },
  supported_features: ["reasoning"],
};

const storedModel = buildSyntheticProviderModelsFromApi([apiModel])[0];

describe("createSyntheticRefreshModels", () => {
  it("uses fresh cached models without calling fetch", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("should not fetch"));
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext({
      store: {
        models: [storedModel],
        checkedAt: Date.now() - 1000,
      },
    });

    const models = await refresh(ctx);

    expect(fetch).not.toHaveBeenCalled();
    expect(models.find((m) => m.id === apiModel.id)).toBeDefined();
  });

  it("fetches when cache is stale", async () => {
    const fetch = vi.fn().mockResolvedValue([apiModel]);
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext({
      store: {
        models: [storedModel],
        checkedAt: Date.now() - MODEL_STORE_TTL_MS - 1000,
      },
    });

    await refresh(ctx);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fetches when force is true even with fresh cache", async () => {
    const fetch = vi.fn().mockResolvedValue([apiModel]);
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext({
      force: true,
      store: {
        models: [storedModel],
        checkedAt: Date.now() - 1000,
      },
    });

    await refresh(ctx);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("writes fetched models to the store", async () => {
    const fetch = vi.fn().mockResolvedValue([apiModel]);
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext();

    await refresh(ctx);
    const written = (
      ctx as unknown as { getWritten: () => Array<{ models: unknown[] }> }
    ).getWritten();

    expect(written).toHaveLength(1);
    expect(written[0]?.models).toHaveLength(1);
  });

  it("falls back to cached models on fetch failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext({
      store: {
        models: [storedModel],
        checkedAt: Date.now() - MODEL_STORE_TTL_MS - 1000,
      },
    });

    const models = await refresh(ctx);

    expect(models.find((m) => m.id === apiModel.id)).toBeDefined();
  });

  it("falls back to static catalog when offline and no cache", async () => {
    const fetch = vi.fn();
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext({ allowNetwork: false });

    const models = await refresh(ctx);

    expect(fetch).not.toHaveBeenCalled();
    expect(models).toHaveLength(SYNTHETIC_MODELS.length);
  });

  it("falls back to static catalog on fetch failure with no cache", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext();

    const models = await refresh(ctx);

    expect(models).toHaveLength(SYNTHETIC_MODELS.length);
  });

  it("ignores invalid cached models and falls back", async () => {
    const fetch = vi.fn().mockResolvedValue([apiModel]);
    const refresh = createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      fetch,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    );
    const ctx = createContext({
      store: {
        models: [{ invalid: true }],
        checkedAt: Date.now() - 1000,
      },
    });

    const models = await refresh(ctx);

    expect(models.find((m) => m.id === apiModel.id)).toBeDefined();
  });
});
