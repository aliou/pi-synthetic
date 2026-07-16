import type { Api, Model, RefreshModelsContext } from "@earendil-works/pi-ai";
import type {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
} from "./models";

type StaticModels = ReturnType<typeof buildSyntheticProviderModels>;
type BuiltModels = ReturnType<typeof buildSyntheticProviderModelsFromApi>;

export type FetchSyntheticApiModels = (
  apiKey: string | undefined,
  signal?: AbortSignal,
) => Promise<readonly unknown[]>;

const MODEL_STORE_TTL_MS = 4 * 60 * 60 * 1000;

interface CachedModels {
  models: unknown[];
  checkedAt: number;
}

async function readCachedModels(
  context: RefreshModelsContext,
): Promise<CachedModels | undefined> {
  try {
    const entry = await context.store.read();
    if (!entry || entry.models.length === 0) return undefined;
    return {
      models: entry.models as unknown[],
      checkedAt: entry.checkedAt ?? 0,
    };
  } catch {
    return undefined;
  }
}

export function createSyntheticRefreshModels(
  staticModels: StaticModels,
  fetchApiModels: FetchSyntheticApiModels,
  buildFromApi: typeof buildSyntheticProviderModelsFromApi,
  buildFromStore: typeof buildSyntheticProviderModelsFromStore,
): (context: RefreshModelsContext) => Promise<BuiltModels> {
  return async (context) => {
    const cached = await readCachedModels(context);

    try {
      if (!context.allowNetwork) {
        return cached ? buildFromStore(cached.models) : staticModels;
      }

      if (
        cached &&
        !context.force &&
        Date.now() - cached.checkedAt < MODEL_STORE_TTL_MS
      ) {
        return buildFromStore(cached.models);
      }

      const apiKey =
        context.credential?.type === "api_key"
          ? context.credential.key
          : undefined;
      const apiModels = await fetchApiModels(apiKey, context.signal);
      if (apiModels.length === 0) {
        throw new Error("Synthetic models API returned an empty model list");
      }

      const models = buildFromApi(apiModels);

      try {
        await context.store.write({
          models: models as unknown as Model<Api>[],
          checkedAt: Date.now(),
        });
      } catch {
        void 0; // Persistence is best-effort.
      }

      return models;
    } catch (error) {
      if (
        context.signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw error;
      }
      try {
        return cached ? buildFromStore(cached.models) : staticModels;
      } catch {
        return staticModels;
      }
    }
  };
}
