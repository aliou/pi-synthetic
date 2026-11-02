import {
  buildSchemaUrl,
  ConfigLoader,
  type Migration,
} from "@aliou/pi-utils-settings";
import pkg from "../../../package.json" with { type: "json" };
import type {
  ResolvedSyntheticConfig,
  SyntheticConfig,
} from "../../../src/config";
import { removeSubBarIntegrationMigration } from "./migrations";

/** Config schema version. Stamped on disk when config is seeded or migrated. */
export const SYNTHETIC_CONFIG_VERSION = pkg.version;

const DEFAULT_CONFIG: ResolvedSyntheticConfig = {
  configVersion: SYNTHETIC_CONFIG_VERSION,
  api: "openai-completions",
  webSearch: true,
  quotasCommand: true,
  usageStatus: false,
  quotaWarnings: false,
  proxyUrl: "",
  proxyRequiresAuth: true,
};

// biome-ignore lint/suspicious/noExplicitAny: the migration is typed against its historical pre-removal config shape, which is not assignable to Migration<SyntheticConfig>; the loader applies migrations to the raw on-disk config record
const migrations: Migration<any>[] = [removeSubBarIntegrationMigration];

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

export const configLoader = new ConfigLoader<
  SyntheticConfig,
  ResolvedSyntheticConfig
>("synthetic", DEFAULT_CONFIG, { migrations, schemaUrl });

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
    return;
  }
}
