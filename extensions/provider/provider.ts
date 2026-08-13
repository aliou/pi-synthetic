import type {
  Api,
  Model,
  Provider,
  ProviderStreamOptions,
} from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import type {
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
  SyntheticModel,
} from "./models";
import {
  createSyntheticRefreshModels,
  type FetchSyntheticApiModels,
} from "./refresh-models";

export const SYNTHETIC_PROVIDER_ID = "synthetic";
export const SYNTHETIC_BASE_URL = "https://api.synthetic.new/openai/v1";
export const SYNTHETIC_API_KEY_ENV = "SYNTHETIC_API_KEY";

const SYNTHETIC_REQUEST_HEADERS = {
  Referer: "https://pi.dev",
  "X-Title": "npm:@aliou/pi-synthetic",
};

function toProviderModels(models: SyntheticModel[]): Model<Api>[] {
  return models.map((model) => ({
    ...model,
    api: "openai-completions",
    provider: SYNTHETIC_PROVIDER_ID,
    baseUrl: SYNTHETIC_BASE_URL,
    headers: SYNTHETIC_REQUEST_HEADERS,
  }));
}

export function createSyntheticProvider(
  staticModels: SyntheticModel[],
  fetchApiModels: FetchSyntheticApiModels,
  buildFromApi: typeof buildSyntheticProviderModelsFromApi,
  buildFromStore: typeof buildSyntheticProviderModelsFromStore,
): Provider {
  let liveModels = toProviderModels(staticModels);
  const refreshCatalog = createSyntheticRefreshModels(
    staticModels,
    fetchApiModels,
    buildFromApi,
    buildFromStore,
  );

  return {
    id: SYNTHETIC_PROVIDER_ID,
    name: "Synthetic",
    baseUrl: SYNTHETIC_BASE_URL,
    headers: SYNTHETIC_REQUEST_HEADERS,
    auth: {
      apiKey: {
        name: "Synthetic API key",
        login: async (interaction) => ({
          type: "api_key",
          key: await interaction.prompt({
            type: "secret",
            message: "Enter Synthetic API key",
          }),
        }),
        check: async ({ ctx, credential }) => {
          if (credential?.type === "api_key" && credential.key) {
            return { type: "api_key", source: "stored credential" };
          }
          if (await ctx.env(SYNTHETIC_API_KEY_ENV)) {
            return { type: "api_key", source: SYNTHETIC_API_KEY_ENV };
          }
          return undefined;
        },
        resolve: async ({ ctx, credential, signal }) => {
          signal.throwIfAborted();
          if (credential?.type === "api_key" && credential.key) {
            return {
              auth: { apiKey: credential.key },
              env: credential.env,
              source: "stored credential",
            };
          }
          const envKey = await ctx.env(SYNTHETIC_API_KEY_ENV);
          signal.throwIfAborted();
          if (envKey) {
            return { auth: { apiKey: envKey }, source: SYNTHETIC_API_KEY_ENV };
          }
          // Anonymous resolution: the model catalog endpoints are public, so
          // resolution succeeds without credentials and sends no token.
          return { auth: { apiKey: "" }, source: "anonymous" };
        },
      },
    },
    getModels: () => liveModels,
    refreshModels: async (context) => {
      const refreshed = await refreshCatalog(context);
      // Fresh store: the refresh intentionally skipped the network; adopt the
      // persisted catalog anyway so getModels reflects it (statics otherwise).
      const next =
        refreshed ??
        (context.stored && context.stored.models.length > 0
          ? buildFromStore(context.stored.models)
          : undefined);
      if (!next) return;
      await context.publish({
        update: () => {
          liveModels = toProviderModels(next);
        },
      });
    },
    stream: (model, context, options) =>
      stream(model, context, options as ProviderStreamOptions | undefined),
    streamSimple,
  };
}
