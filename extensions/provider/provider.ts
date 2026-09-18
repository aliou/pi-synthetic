import type { Provider } from "@earendil-works/pi-ai";
import type { SyntheticApi } from "../../src/config";
import { createAnthropicMessagesApi } from "./api/anthropic-messages";
import { createOpenAiCompletionsApi } from "./api/openai-completions";
import type { SyntheticApiHandler } from "./api/types";
import {
  SYNTHETIC_ANTHROPIC_BASE_URL,
  SYNTHETIC_API_KEY_ENV,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
} from "./constants";
import type {
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
  SyntheticModel,
} from "./models";
import {
  createSyntheticRefreshModels,
  type FetchSyntheticApiModels,
} from "./refresh-models";

export {
  SYNTHETIC_ANTHROPIC_BASE_URL,
  SYNTHETIC_API_KEY_ENV,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
};

export interface SyntheticProviderOptions {
  /** Active API surface; resolved once. Changes need a `/reload`. */
  api?: SyntheticApi;
  openAiStreamSimple?: SyntheticApiHandler["streamSimple"];
  messagesStreamSimple?: SyntheticApiHandler["streamSimple"];
}

function createApiHandler(
  api: SyntheticApi,
  options?: SyntheticProviderOptions,
): SyntheticApiHandler {
  if (api === "anthropic-messages") {
    return createAnthropicMessagesApi({
      streamSimple: options?.messagesStreamSimple,
    });
  }
  return createOpenAiCompletionsApi({
    streamSimple: options?.openAiStreamSimple,
  });
}

export function createSyntheticProvider(
  staticModels: SyntheticModel[],
  fetchApiModels: FetchSyntheticApiModels,
  buildFromApi: typeof buildSyntheticProviderModelsFromApi,
  buildFromStore: typeof buildSyntheticProviderModelsFromStore,
  options?: SyntheticProviderOptions,
): Provider {
  const handler = createApiHandler(
    options?.api ?? "openai-completions",
    options,
  );
  let canonicalModels = staticModels;
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
          // Anonymous: catalog endpoints are public and proxy mode (aperture)
          // handles auth gateway-side, so the provider stays available.
          return { type: "api_key", source: "anonymous" };
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
          // Anonymous: catalog endpoints are public and proxy mode (aperture)
          // handles auth gateway-side, so the provider stays available.
          return { auth: { apiKey: "" }, source: "anonymous" };
        },
      },
    },
    getModels: () => handler.stampModels(canonicalModels),
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
          canonicalModels = next;
        },
      });
    },
    stream: (model, context, options) =>
      handler.stream(model, context, options as never),
    streamSimple: (model, context, options) =>
      handler.streamSimple(model, context, options),
  };
}
