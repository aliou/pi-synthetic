import {
  registerSettingsCommand,
  SettingsDetailEditor,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import {
  formatSyntheticUtilityApiProxySummary,
  hasSyntheticUtilityApiProxy,
  validateSyntheticUtilityApiProxyUrl,
} from "../../../src/client";
import type {
  ResolvedSyntheticConfig,
  SyntheticApi,
  SyntheticConfig,
  SyntheticFeatureId,
} from "../../../src/config";
import { SYNTHETIC_CONFIG_UPDATED_EVENT } from "../../../src/config";
import { configLoader } from "./loader";

export function emitSyntheticConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(SYNTHETIC_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}

export interface RegisterSyntheticSettingsOptions {
  getLoadedFeatures: () => Set<SyntheticFeatureId>;
}

const QUOTA_WARNING_THRESHOLDS_DESCRIPTION =
  "Toggle warnings when your quotas reach thresholds. Thresholds: warning at 80% projected usage, high at 90%, critical at 100% for fixed windows; dynamic windows use adaptive projected thresholds based on window progress.";

export function registerSyntheticSettings(
  pi: ExtensionAPI,
  options: RegisterSyntheticSettingsOptions,
): void {
  const { getLoadedFeatures } = options;
  // The provider stamps its API surface at extension load; a saved change
  // only reaches it after `/reload`.
  let pendingApi: SyntheticApi | undefined;

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
      const proxyUrl = tabConfig?.proxyUrl ?? resolved.proxyUrl;
      const proxyRequiresAuth =
        tabConfig?.proxyRequiresAuth ?? resolved.proxyRequiresAuth;

      const sections: SettingsSection[] = [];

      sections.push(
        {
          label: "Provider",
          items: [
            {
              id: "api",
              label: "API",
              description:
                "Serve models via the OpenAI-compatible /openai/v1 endpoint or the Anthropic-compatible /anthropic endpoint",
              currentValue: tabConfig?.api ?? resolved.api,
              values: ["openai-completions", "anthropic-messages"],
            },
          ],
        },
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
      );

      return sections;
    },
    onSettingChange: (id, newValue, config) => {
      if (id === "api") {
        if (
          newValue !== "openai-completions" &&
          newValue !== "anthropic-messages"
        ) {
          return null;
        }
        pendingApi = newValue;
        return { ...config, api: newValue };
      }

      const featureIds = new Set<string>([
        "webSearch",
        "quotasCommand",
        "usageStatus",
        "quotaWarnings",
      ]);

      if (
        featureIds.has(id) &&
        !getLoadedFeatures().has(id as SyntheticFeatureId)
      ) {
        return null;
      }

      const enabled = newValue === "enabled";
      switch (id) {
        case "webSearch":
          return { ...config, webSearch: enabled };
        case "quotasCommand":
          return { ...config, quotasCommand: enabled };
        case "usageStatus":
          return { ...config, usageStatus: enabled };
        case "quotaWarnings":
          return { ...config, quotaWarnings: enabled };
        default:
          return null;
      }
    },
    onSave: async (ctx) => {
      emitSyntheticConfigUpdated(pi);
      if (pendingApi === undefined) return;
      pendingApi = undefined;
      ctx.ui.notify("Run /reload to apply the new API", "info");
    },
  });
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
