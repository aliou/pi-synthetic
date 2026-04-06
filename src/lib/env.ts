import type { AuthStorage } from "@mariozechner/pi-coding-agent";

const PROVIDER_ID = "synthetic";

/**
 * Get the Synthetic API key through Pi's auth handling.
 *
 * Resolution order:
 * 1. Runtime override (CLI --api-key)
 * 2. auth.json entry for "synthetic"
 * 3. Environment variable SYNTHETIC_API_KEY
 */
export async function getSyntheticApiKey(
  authStorage: AuthStorage,
): Promise<string | undefined> {
  const key = await authStorage.getApiKey(PROVIDER_ID);
  return key ?? process.env.SYNTHETIC_API_KEY;
}
