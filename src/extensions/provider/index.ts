import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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
import { SYNTHETIC_MODELS } from "./models";

export function buildSyntheticProviderModels(includeProxiedModels: boolean) {
  return SYNTHETIC_MODELS.filter(
    (model) => includeProxiedModels || model.provider === "synthetic",
  ).map(({ provider: _provider, ...model }) => ({
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
    apiKey: "SYNTHETIC_API_KEY",
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

  const includeProxiedModels = configLoader.getConfig().proxiedModels;
  registerSyntheticProvider(pi, { includeProxiedModels });

  pi.events.on(SYNTHETIC_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const includeProxiedModels = (data as SyntheticConfigUpdatedPayload).config
      .proxiedModels;
    registerSyntheticProvider(pi, { includeProxiedModels });
  });

  const loadedFeatures = new Set<SyntheticFeatureId>();

  pi.events.on(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as SyntheticExtensionsRegisterPayload;
    loadedFeatures.add(feature);
  });

  registerSyntheticSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
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
    pi.events.emit(SYNTHETIC_EXTENSIONS_REQUEST_EVENT, undefined);
    emitSyntheticConfigUpdated(pi);
  });
}
