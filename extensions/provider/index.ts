import { getApiProvider } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
} from "../../src/client";
import {
  configLoader,
  emitSyntheticConfigUpdated,
  pendingMessages,
  registerSyntheticSettings,
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticConfigUpdatedPayload,
  type SyntheticExtensionsRegisterPayload,
  type SyntheticFeatureId,
  seedSyntheticConfigIfMissing,
} from "../../src/config";
import { type QuotaSnapshot, QuotaStore } from "../../src/services/quota-store";
import {
  parseQuotaHeader,
  type QuotasResponse,
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
  type SyntheticQuotasSnapshotPayload,
} from "../../src/types/quotas";
import { SYNTHETIC_OVERFLOW_PATTERN } from "./context-overflow";
import {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
} from "./models";
import { createSyntheticRefreshModels } from "./refresh-models";
import { wrapSyntheticStreamSimple } from "./stream-simple";

export function registerSyntheticProvider(pi: ExtensionAPI): void {
  const config: ProviderConfig = {
    baseUrl: "https://api.synthetic.new/openai/v1",
    apiKey: "$SYNTHETIC_API_KEY",
    api: "openai-completions",
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-synthetic",
    },
    models: buildSyntheticProviderModels(),
    refreshModels: createSyntheticRefreshModels(
      buildSyntheticProviderModels(),
      async (apiKey, signal) => {
        const client = new SyntheticClient({ apiKey });
        const result = await client.models({ signal });
        return result.data ?? [];
      },
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
    ),
  };

  const provider = getApiProvider("openai-completions");
  if (provider?.streamSimple) {
    config.streamSimple = wrapSyntheticStreamSimple(provider.streamSimple);
  } else if (
    process.env.PI_SYNTHETIC_DEBUG === "1" ||
    process.env.PI_SYNTHETIC_DEBUG === "true"
  ) {
    console.warn(
      "[synthetic] openai-completions streamSimple is not available; subscription cache-read discount will not be applied.",
    );
  }

  pi.registerProvider("synthetic", config);
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  await seedSyntheticConfigIfMissing();

  const initialConfig = configLoader.getConfig();
  let utilityApiProxyUrl = initialConfig.proxyUrl;
  let utilityApiProxyRequiresAuth = initialConfig.proxyRequiresAuth;
  const quotaStore = new QuotaStore();
  let getApiKey: (() => Promise<string | undefined>) | undefined;

  registerSyntheticProvider(pi);

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const config = (data as SyntheticConfigUpdatedPayload).config;
    registerSyntheticProvider(pi);

    if (
      config.proxyUrl !== utilityApiProxyUrl ||
      config.proxyRequiresAuth !== utilityApiProxyRequiresAuth
    ) {
      quotaStore.clear();
      utilityApiProxyUrl = config.proxyUrl;
      utilityApiProxyRequiresAuth = config.proxyRequiresAuth;
    }
  });

  const loadedFeatures = new Set<SyntheticFeatureId>();

  pi.events.on(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as SyntheticExtensionsRegisterPayload;
    loadedFeatures.add(feature);
  });

  registerSyntheticSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  async function fetchQuotasFromAuth(): Promise<QuotasResponse | undefined> {
    const config = configLoader.getConfig();
    const clientOptions = await resolveSyntheticClientOptions(config, () =>
      getApiKey ? getApiKey() : Promise.resolve(undefined),
    );
    if (!clientOptions) return undefined;

    const client = new SyntheticClient(clientOptions);
    const result = await client.quotas();
    return result.success ? result.data.quotas : undefined;
  }

  quotaStore.subscribe((snapshot) => {
    pi.events.emit(SYNTHETIC_QUOTAS_UPDATED_EVENT, {
      quotas: snapshot.quotas,
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
    });
  });

  function toSnapshotPayload(
    snapshot: QuotaSnapshot | undefined,
  ): SyntheticQuotasSnapshotPayload | undefined {
    if (!snapshot) return undefined;
    return {
      quotas: snapshot.quotas,
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
    };
  }

  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== "synthetic") return;
    const quotas = parseQuotaHeader(event.headers);
    if (quotas) quotaStore.ingest(quotas, "header");
  });

  pi.on("message_end", (event) => {
    const msg = event.message;
    if (msg.role !== "assistant") return;
    if (msg.stopReason !== "error") return;
    if (msg.provider !== "synthetic") return;

    const errorMessage = msg.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;
    if (!SYNTHETIC_OVERFLOW_PATTERN.test(errorMessage)) return;

    return {
      message: {
        ...msg,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });

  pi.events.on(SYNTHETIC_QUOTAS_REQUEST_EVENT, async (data: unknown) => {
    const payload = data as SyntheticQuotasRequestPayload | undefined;
    const snapshot = await quotaStore.refreshFromApi(fetchQuotasFromAuth);
    if (payload?.respond) {
      payload.respond(toSnapshotPayload(snapshot));
    }
  });

  pi.events.on(SYNTHETIC_QUOTAS_READ_EVENT, (data: unknown) => {
    const { respond } = data as SyntheticQuotasReadPayload;
    respond(toSnapshotPayload(quotaStore.getSnapshot()));
  });

  pi.on("session_before_switch", () => {
    quotaStore.clear();
    getApiKey = undefined;
  });

  pi.on("session_shutdown", () => {
    quotaStore.clear();
    getApiKey = undefined;
  });

  pi.on("session_start", async (_event, ctx) => {
    const messages = pendingMessages.splice(0).map((m) => `- ${m}`);
    if (messages.length > 0) {
      ctx.ui.notify(
        `[synthetic] Migration messages: \n ${messages.join("\n")}`,
        "info",
      );
    }

    loadedFeatures.clear();
    quotaStore.clear();
    getApiKey = () => ctx.modelRegistry.getApiKeyForProvider("synthetic");
    pi.events.emit(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, undefined);
    emitSyntheticConfigUpdated(pi);
  });
}
