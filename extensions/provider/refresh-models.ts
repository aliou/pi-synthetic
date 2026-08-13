// refreshModels implementation for the Synthetic model catalog.
// Restores from a stored snapshot, refreshes from the Synthetic models API on
// a 4-hour TTL, and persists fetched catalogs through context.publish().
// Falls back to the static catalog when offline or the fetch fails.

import type {
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { SyntheticApiModel } from "../../src/client/types";
import type {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
} from "./models";

export const MODEL_STORE_TTL_MS = 4 * 60 * 60 * 1000;

export type FetchSyntheticApiModels = (
  apiKey: string | undefined,
  signal?: AbortSignal,
) => Promise<readonly SyntheticApiModel[]>;

function isFreshStoreEntry(
  entry: Readonly<ModelsStoreEntry> | undefined,
): entry is ModelsStoreEntry {
  if (!entry) return false;
  const checkedAt = entry.checkedAt ?? Date.now();
  return Date.now() - checkedAt < MODEL_STORE_TTL_MS;
}

export function createSyntheticRefreshModels(
  staticModels: ReturnType<typeof buildSyntheticProviderModels>,
  fetchApiModels: FetchSyntheticApiModels,
  buildFromApi: typeof buildSyntheticProviderModelsFromApi,
  buildFromStore: typeof buildSyntheticProviderModelsFromStore,
) {
  return async (
    context: RefreshModelsContext,
  ): Promise<ReturnType<typeof buildSyntheticProviderModels>> => {
    context.signal.throwIfAborted();
    const fallback = buildFromStore(staticModels);
    try {
      if (!context.allowNetwork) {
        return context.stored
          ? buildFromStore(context.stored.models)
          : fallback;
      }
      if (!context.force && isFreshStoreEntry(context.stored)) {
        return buildFromStore(context.stored.models);
      }
      const apiKey =
        context.credential?.type === "api_key"
          ? context.credential.key
          : undefined;
      const apiModels = await fetchApiModels(apiKey, context.signal);
      context.signal.throwIfAborted();
      const models = buildFromApi(apiModels);
      // Cache persistence is best-effort.
      await context
        .publish({
          persist: {
            models: models as unknown as ModelsStoreEntry["models"],
            checkedAt: Date.now(),
          },
        })
        .catch(() => undefined);
      context.signal.throwIfAborted();
      return models;
    } catch (error) {
      if (
        context.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      return fallback;
    }
  };
}
