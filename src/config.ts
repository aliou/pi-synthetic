import {
  ConfigLoader,
  type Migration,
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SettingItem } from "@mariozechner/pi-tui";
import pkg from "../package.json" with { type: "json" };

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

/**
 * Config schema version. Stamped on disk when the initial migration runs or
 * when the config is seeded. Uses the package version; bumping the package
 * does not retrigger migrations (we only run them when `configVersion` is
 * missing), but it records which release first created the file.
 */
export const SYNTHETIC_CONFIG_VERSION: string = pkg.version;

export interface SyntheticConfig {
  configVersion?: string;
  webSearch?: boolean;
  quotasCommand?: boolean;
  usageStatus?: boolean;
  quotaWarnings?: boolean;
  subBarIntegration?: boolean;
}

export interface ResolvedSyntheticConfig {
  configVersion: string;
  webSearch: boolean;
  quotasCommand: boolean;
  usageStatus: boolean;
  quotaWarnings: boolean;
  subBarIntegration: boolean;
}

const DEFAULT_CONFIG: ResolvedSyntheticConfig = {
  configVersion: SYNTHETIC_CONFIG_VERSION,
  webSearch: true,
  quotasCommand: true,
  usageStatus: false,
  quotaWarnings: false,
  subBarIntegration: true,
};

// Module-level flag set when the v1 migration runs or when the global config
// is seeded for the first time. Consumed once by the provider extension to
// display a one-time notice about the new settings UI.
let pendingMigrationNotice = false;

export function hasPendingMigrationNotice(): boolean {
  return pendingMigrationNotice;
}

export function clearPendingMigrationNotice(): void {
  pendingMigrationNotice = false;
}

function markMigrationNoticePending(): void {
  pendingMigrationNotice = true;
}

const migrations: Migration<SyntheticConfig>[] = [
  {
    name: "seed-defaults",
    shouldRun: (config) => config.configVersion === undefined,
    run: (config) => {
      markMigrationNoticePending();
      return {
        configVersion: SYNTHETIC_CONFIG_VERSION,
        webSearch: config.webSearch ?? DEFAULT_CONFIG.webSearch,
        quotasCommand: config.quotasCommand ?? DEFAULT_CONFIG.quotasCommand,
        usageStatus: config.usageStatus ?? DEFAULT_CONFIG.usageStatus,
        quotaWarnings: config.quotaWarnings ?? DEFAULT_CONFIG.quotaWarnings,
        subBarIntegration:
          config.subBarIntegration ?? DEFAULT_CONFIG.subBarIntegration,
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
 * any scope, this writes the current defaults (with configVersion) to the
 * global scope and flags the migration notice as pending.
 *
 * Must be called after `configLoader.load()`.
 */
export async function seedSyntheticConfigIfMissing(): Promise<void> {
  if (configLoader.hasConfig("global") || configLoader.hasConfig("local")) {
    return;
  }
  markMigrationNoticePending();
  try {
    await configLoader.save("global", {
      configVersion: SYNTHETIC_CONFIG_VERSION,
      webSearch: DEFAULT_CONFIG.webSearch,
      quotasCommand: DEFAULT_CONFIG.quotasCommand,
      usageStatus: DEFAULT_CONFIG.usageStatus,
      quotaWarnings: DEFAULT_CONFIG.quotaWarnings,
      subBarIntegration: DEFAULT_CONFIG.subBarIntegration,
    });
  } catch {
    // If the write fails, keep the notice pending so the user still sees it.
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
    buildSections: (tabConfig, resolved): SettingsSection[] => {
      const loaded = getLoadedFeatures();
      const webSearch = tabConfig?.webSearch ?? resolved.webSearch;
      const quotasCommand = tabConfig?.quotasCommand ?? resolved.quotasCommand;
      const usageStatus = tabConfig?.usageStatus ?? resolved.usageStatus;
      const quotaWarnings = tabConfig?.quotaWarnings ?? resolved.quotaWarnings;
      const subBarIntegration =
        tabConfig?.subBarIntegration ?? resolved.subBarIntegration;

      const sections: SettingsSection[] = [];

      sections.push(
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
      if (!getLoadedFeatures().has(id as SyntheticFeatureId)) {
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
