import {
  ConfigLoader,
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface SyntheticConfig {
  webSearch?: boolean;
  quotasCommand?: boolean;
  usageStatus?: boolean;
  quotaWarnings?: boolean;
  subBarIntegration?: boolean;
}

export interface ResolvedSyntheticConfig {
  webSearch: boolean;
  quotasCommand: boolean;
  usageStatus: boolean;
  quotaWarnings: boolean;
  subBarIntegration: boolean;
}

const DEFAULT_CONFIG: ResolvedSyntheticConfig = {
  webSearch: true,
  quotasCommand: true,
  usageStatus: false,
  quotaWarnings: false,
  subBarIntegration: true,
};

export const configLoader = new ConfigLoader<
  SyntheticConfig,
  ResolvedSyntheticConfig
>("synthetic", DEFAULT_CONFIG);

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

export function registerSyntheticSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<SyntheticConfig, ResolvedSyntheticConfig>(pi, {
    commandName: "synthetic:settings",
    commandDescription: "Configure Synthetic extension settings",
    title: "Synthetic Settings",
    configStore: configLoader,
    buildSections: (tabConfig, resolved): SettingsSection[] => {
      const webSearch = tabConfig?.webSearch ?? resolved.webSearch;
      const quotasCommand = tabConfig?.quotasCommand ?? resolved.quotasCommand;
      const usageStatus = tabConfig?.usageStatus ?? resolved.usageStatus;
      const quotaWarnings = tabConfig?.quotaWarnings ?? resolved.quotaWarnings;
      const subBarIntegration =
        tabConfig?.subBarIntegration ?? resolved.subBarIntegration;

      return [
        {
          label: "Features",
          items: [
            {
              id: "webSearch",
              label: "Web Search",
              description: "synthetic_web_search tool",
              currentValue: webSearch ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
            {
              id: "quotasCommand",
              label: "Quotas Command",
              description: "synthetic:quotas command",
              currentValue: quotasCommand ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
            {
              id: "usageStatus",
              label: "Usage Status",
              description: "Footer quota usage status",
              currentValue: usageStatus ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
            {
              id: "quotaWarnings",
              label: "Quota Warnings",
              description: "Quota warnings during sessions",
              currentValue: quotaWarnings ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
            {
              id: "subBarIntegration",
              label: "subBar Integration",
              description: "Push Synthetic usage into subBar",
              currentValue: subBarIntegration ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config) => {
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
