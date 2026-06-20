import type {
  AuthStorage,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
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
} from "../../config";
import { getSyntheticApiKey } from "../../lib/env";
import { resolveSyntheticUtilityApiAuth } from "../../lib/utility-api";
import { QuotaStore } from "../../services/quota-store";
import {
  parseQuotaHeader,
  type QuotasResponse,
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  SYNTHETIC_QUOTAS_UPDATED_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
} from "../../types/quotas";
import { fetchQuotas } from "../../utils/quotas";
import { SYNTHETIC_OVERFLOW_PATTERN } from "./context-overflow";
import {
  type ConcreteSyntheticModelConfig,
  isAlias,
  SYNTHETIC_MODELS,
} from "./models";

export function buildSyntheticProviderModels(includeProxiedModels: boolean) {
  const concreteModels = SYNTHETIC_MODELS.filter(
    (m): m is ConcreteSyntheticModelConfig => !isAlias(m),
  );
  const byId = new Map(concreteModels.map((m) => [m.id, m]));

  const resolved = SYNTHETIC_MODELS.map((entry) => {
    if (!isAlias(entry)) return entry;

    const target = byId.get(entry.aliasFor);
    if (!target) {
      throw new Error(
        `Synthetic alias "${entry.id}" references missing model "${entry.aliasFor}"`,
      );
    }

    return {
      ...target,
      id: entry.id,
      name: entry.name,
      provider: "synthetic" as const,
    };
  });

  return resolved
    .filter((model) => includeProxiedModels || model.provider === "synthetic")
    .map(({ provider: _provider, ...model }) => ({
      ...model,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens" as const,
        ...model.compat,
      },
    }));
}

interface RegisterSyntheticProviderOptions {
  includeProxiedModels: boolean;
}

export function registerSyntheticProvider(
  pi: ExtensionAPI,
  options: RegisterSyntheticProviderOptions,
): void {
  pi.registerProvider("synthetic", {
    baseUrl: "https://api.synthetic.new/openai/v1",
    apiKey: "$SYNTHETIC_API_KEY",
    api: "openai-completions",
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-synthetic",
    },
    models: buildSyntheticProviderModels(options.includeProxiedModels),
  });
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  await seedSyntheticConfigIfMissing();

  const initialConfig = configLoader.getConfig();
  const includeProxiedModels = initialConfig.proxiedModels;
  let utilityApiProxyUrl = initialConfig.proxyUrl;
  let utilityApiProxyRequiresAuth = initialConfig.proxyRequiresAuth;
  const quotaStore = new QuotaStore();
  let currentAuthStorage: AuthStorage | undefined;

  registerSyntheticProvider(pi, { includeProxiedModels });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const config = (data as SyntheticConfigUpdatedPayload).config;
    registerSyntheticProvider(pi, {
      includeProxiedModels: config.proxiedModels,
    });

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
    const auth = await resolveSyntheticUtilityApiAuth(config, () =>
      currentAuthStorage
        ? getSyntheticApiKey(currentAuthStorage)
        : Promise.resolve(undefined),
    );
    if (!auth) return undefined;

    const result = await fetchQuotas({
      apiKey: auth.apiKey,
      proxyUrl: config.proxyUrl,
      requiresAuth: auth.requiresAuth,
    });
    return result.success ? result.data.quotas : undefined;
  }

  quotaStore.subscribe((snapshot) => {
    pi.events.emit(SYNTHETIC_QUOTAS_UPDATED_EVENT, {
      quotas: snapshot.quotas,
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
    });
  });

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
      payload.respond(snapshot);
    }
  });

  pi.events.on(SYNTHETIC_QUOTAS_READ_EVENT, (data: unknown) => {
    const { respond } = data as SyntheticQuotasReadPayload;
    respond(quotaStore.getSnapshot());
  });

  pi.on("session_before_switch", () => {
    quotaStore.clear();
    currentAuthStorage = undefined;
  });

  pi.on("session_shutdown", () => {
    quotaStore.clear();
    currentAuthStorage = undefined;
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
    currentAuthStorage = ctx.modelRegistry.authStorage;
    pi.events.emit(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, undefined);
    emitSyntheticConfigUpdated(pi);
  });
}
