import type { Migration } from "@aliou/pi-utils-settings";

export const SUB_BAR_GIST_URL =
  "https://gist.github.com/aliou/7cce00c3be0c4c94e2bb305a215f5d93";

interface PreRemovalSyntheticConfig {
  [key: string]: unknown;
  subBarIntegration?: boolean;
}

export const removeSubBarIntegrationMigration: Migration<PreRemovalSyntheticConfig> =
  {
    name: "remove-sub-bar-integration",
    version: "0.29.0",
    shouldRun: (config) => config.subBarIntegration !== undefined,
    message: `[synthetic] The built-in sub-bar integration was removed. Test with pi -e ${SUB_BAR_GIST_URL} and install with pi install ${SUB_BAR_GIST_URL}. Note that the extension won't be kept up to date with either pi-synthetic or pi-sub-core.`,
    run: (config) => {
      if (config.subBarIntegration === undefined) return config;

      const { subBarIntegration: _removed, ...rest } = config;
      return rest;
    },
  };
