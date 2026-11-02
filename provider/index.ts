import type { Provider } from "@earendil-works/pi-ai";
import { createProvider } from "@earendil-works/pi-ai/models";
import {
  SYNTHETIC_BASE_URL,
  SYNTHETIC_PROVIDER_ID,
  SYNTHETIC_REQUEST_HEADERS,
} from "../src/constants";
import {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
} from "../src/models";
import {
  createApiHandler,
  createSyntheticApiKeyAuth,
  type SyntheticProviderOptions,
} from "../src/provider";
import { fetchSyntheticApiModels } from "../src/refresh-models";

export type { SyntheticProviderOptions };

export default function createSyntheticProvider(
  options?: SyntheticProviderOptions,
): Provider {
  const handler = createApiHandler(
    options?.api ?? "openai-completions",
    options,
  );
  return createProvider({
    id: SYNTHETIC_PROVIDER_ID,
    name: "Synthetic",
    baseUrl: SYNTHETIC_BASE_URL,
    headers: SYNTHETIC_REQUEST_HEADERS,
    auth: { apiKey: createSyntheticApiKeyAuth() },
    models: handler.stampModels(buildSyntheticProviderModels()),
    fetchModels: async (context) => {
      const apiKey =
        context.credential?.type === "api_key"
          ? context.credential.key
          : undefined;
      const apiModels = await fetchSyntheticApiModels(apiKey, context.signal);
      return handler.stampModels(
        buildSyntheticProviderModelsFromApi(apiModels),
      );
    },
    api: handler,
  });
}
