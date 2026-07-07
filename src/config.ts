import {
  ConfigLoader,
  type Migration,
  registerSettingsCommand,
  SettingsDetailEditor,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import pkg from "../package.json" with { type: "json" };
import {
  formatSyntheticUtilityApiProxySummary,
  hasSyntheticUtilityApiProxy,
  validateSyntheticUtilityApiProxyUrl,
} from "./client";

export type SyntheticFeatureId =
  | "webSearch"
  | "quotasCommand"
  | "subBarIntegration"
  | "usageStatus"
  | "quotaWarnings";

export const SYNTHETIC_EXTENSIONS_REQUEST_EVENT =
  "synthetic:extensions:request" as const;

export const SYNTHETIC_EXTENSIONS_REGISTER_EVENT =
  "synthetic:extensions:register" as const;

export interface SyntheticExtensionsRegisterPayload {
  feature: SyntheticFeatureId;
}

/** Config schema version. Stamped on disk when config is seeded or migrated. */
export const SYNTHETIC_CONFIG_VERSION: string = pkg.version;

export interface SyntheticConfig {
  configVersion?: string;
  webSearch?: boolean;
  quotasCommand?: boolean;
  usageStatus?: boolean;
  quotaWarnings?: boolean;
  subBarIntegration?: boolean;
  proxiedModels?: boolean;
  proxyUrl?: string;
  proxyRequiresAuth?: boolean;
}

export interface ResolvedSyntheticConfig {
  configVersion: string;
  webSearch: boolean;
  quotasCommand: boolean;
  usageStatus: boolean;
  quotaWarnings: boolean;
  subBarIntegration: boolean;
  proxiedModels: boolean;
  proxyUrl: string;
  proxyRequiresAuth: boolean;
}

const DEFAULT_CONFIG: ResolvedSyntheticConfig = {
  configVersion: SYNTHETIC_CONFIG_VERSION,
  webSearch: true,
  quotasCommand: true,
  usageStatus: false,
  quotaWarnings: false,
  subBarIntegration: true,
  proxiedModels: false,
  proxyUrl: "",
  proxyRequiresAuth: true,
};

export const pendingMessages: string[] = [];

function needsProxiedModelsMigration(config: SyntheticConfig): boolean {
  if (config.proxiedModels !== undefined) return false;
  if (config.configVersion === undefined) return true;
  return (
    config.configVersion.localeCompare("0.13.5", undefined, {
      numeric: true,
    }) <= 0
  );
}

const migrations: Migration<SyntheticConfig>[] = [
  {
    name: "seed-proxied-models",
    shouldRun: needsProxiedModelsMigration,
    run: (config) => {
      pendingMessages.push(
        "This provider now differentiates hosted models from proxied models and allows disabling them. Use `/synthetic:settings` to disable them.",
      );
      return {
        ...config,
        configVersion: SYNTHETIC_CONFIG_VERSION,
        proxiedModels: true,
      };
    },
  },
];

const QUOTA_WARNING_THRESHOLDS_DESCRIPTION =
  "Toggle warnings when your quotas reach thresholds. Thresholds: warning at 80% projected usage, high at 90%, critical at 100% for fixed windows; dynamic windows use adaptive projected thresholds based on window progress.";

export const configLoader = new ConfigLoader<
  SyntheticConfig,
  ResolvedSyntheticConfig
>("synthetic", DEFAULT_CONFIG, { migrations });

/**
 * Seed the global config file on first use. When no config file exists in
 * any scope, this writes the current defaults with configVersion.
 *
 * Must be called after `configLoader.load()`.
 */
export async function seedSyntheticConfigIfMissing(): Promise<void> {
  if (configLoader.hasConfig("global") || configLoader.hasConfig("local")) {
    return;
  }
  try {
    await configLoader.save("global", DEFAULT_CONFIG);
  } catch {
    // Ignore seed failures. Defaults still resolve in memory.
  }
}

export const SYNTHETIC_CONFIG_UPDATED_EVENT =
  "synthetic:config:updated" as const;

export interface SyntheticConfigUpdatedPayload {
  config: ResolvedSyntheticConfig;
}

export function emitSyntheticConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(SYNTHETIC_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}

export interface RegisterSyntheticSettingsOptions {
  getLoadedFeatures: () => Set<SyntheticFeatureId>;
}

function featureRow(
  id: SyntheticFeatureId,
  label: string,
  description: string,
  configValue: boolean,
  isLoaded: boolean,
): SettingItem {
  if (isLoaded) {
    return {
      id,
      label,
      description,
      currentValue: configValue ? "enabled" : "disabled",
      values: ["enabled", "disabled"],
    };
  }
  return {
    id,
    label,
    description: `${description} (Not loaded by Pi)`,
    currentValue: "unavailable",
    values: [],
  };
}

export function registerSyntheticSettings(
  pi: ExtensionAPI,
  options: RegisterSyntheticSettingsOptions,
): void {
  const { getLoadedFeatures } = options;

  registerSettingsCommand<SyntheticConfig, ResolvedSyntheticConfig>(pi, {
    commandName: "synthetic:settings",
    commandDescription: "Configure Synthetic extension settings",
    title: "Synthetic Settings",
    configStore: configLoader,
    buildSections: (tabConfig, resolved, ctx): SettingsSection[] => {
      const loaded = getLoadedFeatures();
      const webSearch = tabConfig?.webSearch ?? resolved.webSearch;
      const quotasCommand = tabConfig?.quotasCommand ?? resolved.quotasCommand;
      const usageStatus = tabConfig?.usageStatus ?? resolved.usageStatus;
      const quotaWarnings = tabConfig?.quotaWarnings ?? resolved.quotaWarnings;
      const subBarIntegration =
        tabConfig?.subBarIntegration ?? resolved.subBarIntegration;
      const proxiedModels = tabConfig?.proxiedModels ?? resolved.proxiedModels;
      const proxyUrl = tabConfig?.proxyUrl ?? resolved.proxyUrl;
      const proxyRequiresAuth =
        tabConfig?.proxyRequiresAuth ?? resolved.proxyRequiresAuth;

      const sections: SettingsSection[] = [];

      sections.push(
        {
          label: "Connection",
          items: [
            {
              id: "utilityApiProxy",
              label: "Utility API Proxy",
              description:
                "Override the Synthetic quotas and web search API root. The provider endpoint is not proxied.",
              currentValue: formatSyntheticUtilityApiProxySummary({
                proxyUrl,
                proxyRequiresAuth,
              }),
              submenu: (_current, done) => {
                const current: SyntheticConfig =
                  tabConfig ?? (ctx.scope === "memory" ? resolved : {});
                let nextProxyUrl = proxyUrl;
                let nextProxyRequiresAuth =
                  proxyUrl.trim() || proxyRequiresAuth
                    ? proxyRequiresAuth
                    : true;

                const syncDraft = () => {
                  ctx.setDraft({
                    ...current,
                    proxyUrl: nextProxyUrl.trim() || undefined,
                    proxyRequiresAuth: nextProxyRequiresAuth,
                  });
                };

                return new SettingsDetailEditor({
                  title: "Utility API Proxy",
                  theme: ctx.theme,
                  fields: [
                    {
                      id: "proxyUrl.detail",
                      type: "text",
                      label: "Proxy URL",
                      description:
                        "Leave empty to call https://api.synthetic.new directly for quotas and web search.",
                      getValue: () => nextProxyUrl,
                      setValue: (value) => {
                        nextProxyUrl = value;
                        // Requires auth only makes sense with a proxy.
                        // Enforce enabled state when the URL is empty.
                        if (!value.trim()) nextProxyRequiresAuth = true;
                        syncDraft();
                      },
                      validate: validateSyntheticUtilityApiProxyUrl,
                      emptyValueText: "direct",
                    },
                    {
                      id: "proxyRequiresAuth.detail",
                      type: "boolean",
                      label: "Requires auth",
                      description:
                        "When disabled, quotas and web search skip the Synthetic API key check and omit Authorization. Only effective when a proxy URL is set.",
                      getValue: () =>
                        hasSyntheticUtilityApiProxy({
                          proxyUrl: nextProxyUrl,
                          proxyRequiresAuth: nextProxyRequiresAuth,
                        })
                          ? nextProxyRequiresAuth
                          : true,
                      setValue: (value) => {
                        nextProxyRequiresAuth = hasSyntheticUtilityApiProxy({
                          proxyUrl: nextProxyUrl,
                          proxyRequiresAuth: nextProxyRequiresAuth,
                        })
                          ? value
                          : true;
                        syncDraft();
                      },
                      trueLabel: "enabled",
                      falseLabel: "disabled",
                    },
                  ],
                  onDone: done,
                  getDoneSummary: () =>
                    formatSyntheticUtilityApiProxySummary({
                      proxyUrl: nextProxyUrl,
                      proxyRequiresAuth: nextProxyRequiresAuth,
                    }),
                });
              },
            },
          ],
        },
        {
          label: "Models",
          items: [
            {
              id: "proxiedModels",
              label: "Proxied Models",
              description:
                "Allow models that Synthetic proxies to upstream backends such as Fireworks or Together. Disable to show only models hosted directly by Synthetic.",
              currentValue: proxiedModels ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
          ],
        },
        {
          label: "Tools",
          items: [
            featureRow(
              "webSearch",
              "Web Search",
              "Toggle `synthetic_web_search`, a tool for searching online with zero data retention",
              webSearch,
              loaded.has("webSearch"),
            ),
          ],
        },
        {
          label: "Quotas",
          items: [
            featureRow(
              "quotasCommand",
              "Quotas Command",
              "Toggle the `/synthetic:quotas` command, showing your quotas at a glance",
              quotasCommand,
              loaded.has("quotasCommand"),
            ),
            featureRow(
              "usageStatus",
              "Usage widget",
              "Toggle the usage widget, showing your usage at a glance",
              usageStatus,
              loaded.has("usageStatus"),
            ),
            featureRow(
              "quotaWarnings",
              "Quota Warnings",
              QUOTA_WARNING_THRESHOLDS_DESCRIPTION,
              quotaWarnings,
              loaded.has("quotaWarnings"),
            ),
          ],
        },
        {
          label: "Integration",
          items: [
            featureRow(
              "subBarIntegration",
              "pi-sub-bar integration",
              "Integration with `@marckrenn/pi-sub-bar`",
              subBarIntegration,
              loaded.has("subBarIntegration"),
            ),
          ],
        },
      );

      return sections;
    },
    onSettingChange: (id, newValue, config) => {
      const featureIds = new Set<string>([
        "webSearch",
        "quotasCommand",
        "usageStatus",
        "quotaWarnings",
        "subBarIntegration",
      ]);

      if (
        featureIds.has(id) &&
        !getLoadedFeatures().has(id as SyntheticFeatureId)
      ) {
        return null;
      }

      const enabled = newValue === "enabled";
      switch (id) {
        case "proxiedModels":
          return { ...config, proxiedModels: enabled };
        case "webSearch":
          return { ...config, webSearch: enabled };
        case "quotasCommand":
          return { ...config, quotasCommand: enabled };
        case "usageStatus":
          return { ...config, usageStatus: enabled };
        case "quotaWarnings":
          return { ...config, quotaWarnings: enabled };
        case "subBarIntegration":
          return { ...config, subBarIntegration: enabled };
        default:
          return null;
      }
    },
    onSave: async () => {
      emitSyntheticConfigUpdated(pi);
    },
  });
}
