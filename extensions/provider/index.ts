import { bindProjectConfig } from "@aliou/pi-utils-settings";
import {
  anthropicMessagesApi,
  openAICompletionsApi,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
} from "../../src/client";
import {
  SYNTHETIC_CONFIG_UPDATED_EVENT,
  SYNTHETIC_EXTENSIONS_REGISTER_EVENT,
  SYNTHETIC_EXTENSIONS_REQUEST_EVENT,
  type SyntheticConfigUpdatedPayload,
  type SyntheticExtensionsRegisterPayload,
  type SyntheticFeatureId,
} from "../../src/config";
import {
  buildSyntheticProviderModels,
  buildSyntheticProviderModelsFromApi,
  buildSyntheticProviderModelsFromStore,
} from "../../src/models";
import { createSyntheticProvider } from "../../src/provider";
import { fetchSyntheticApiModels } from "../../src/refresh-models";
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
import {
  configLoader,
  notifySyntheticConfigMessages,
  seedSyntheticConfigIfMissing,
} from "../_shared/config/loader";
import {
  emitSyntheticConfigUpdated,
  registerSyntheticSettings,
} from "../_shared/config/settings";
import { SYNTHETIC_OVERFLOW_PATTERN } from "./context-overflow";

/** Synthetic relays upstream inference timeouts as HTTP 408 responses. */
const SYNTHETIC_TIMEOUT_PATTERN = /408 status code/i;

export function registerSyntheticProvider(pi: ExtensionAPI): void {
  const staticModels = buildSyntheticProviderModels();

  pi.registerProvider(
    createSyntheticProvider(
      staticModels,
      fetchSyntheticApiModels,
      buildSyntheticProviderModelsFromApi,
      buildSyntheticProviderModelsFromStore,
      {
        api: configLoader.getConfig().api,
        // pi's extension loader resolves pi-ai/compat to its bundled view;
        // the lazy subpaths in src/ are not aliased and fail to resolve.
        openAiUpstream: openAICompletionsApi(),
        messagesUpstream: anthropicMessagesApi(),
      },
    ),
  );
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  bindProjectConfig(pi, configLoader);
  await seedSyntheticConfigIfMissing();

  const initialConfig = configLoader.getConfig();
  let utilityApiProxyUrl = initialConfig.proxyUrl;
  let utilityApiProxyRequiresAuth = initialConfig.proxyRequiresAuth;
  const quotaStore = new QuotaStore();
  let getApiKey: (() => Promise<string | undefined>) | undefined;

  registerSyntheticProvider(pi);
  let registeredApi = initialConfig.api;

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const config = (data as SyntheticConfigUpdatedPayload).config;

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
    if (SYNTHETIC_OVERFLOW_PATTERN.test(errorMessage)) {
      return {
        message: {
          ...msg,
          errorMessage: `context_length_exceeded: ${errorMessage}`,
        },
      };
    }

    if (!SYNTHETIC_TIMEOUT_PATTERN.test(errorMessage)) return;

    // Pi retries error messages containing "timeout"; the 408 status itself is not retried.
    return {
      message: {
        ...msg,
        errorMessage: `timeout: ${errorMessage}`,
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
    notifySyntheticConfigMessages(ctx);
    const config = configLoader.getConfig();
    if (config.api !== registeredApi) {
      registerSyntheticProvider(pi);
      registeredApi = config.api;
    }
    loadedFeatures.clear();
    quotaStore.clear();
    getApiKey = () => ctx.modelRegistry.getApiKeyForProvider("synthetic");
    pi.events.emit(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, undefined);
    emitSyntheticConfigUpdated(pi);
  });
}
