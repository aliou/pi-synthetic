export const DEFAULT_SYNTHETIC_API_BASE_URL = "https://api.synthetic.new";

export interface SyntheticUtilityApiConfig {
  proxyUrl?: string;
  proxyRequiresAuth?: boolean;
}

export function hasSyntheticUtilityApiProxy(
  config: SyntheticUtilityApiConfig,
): boolean {
  return !!config.proxyUrl?.trim();
}

export function syntheticUtilityApiRequiresAuth(
  config: SyntheticUtilityApiConfig,
): boolean {
  return (
    !hasSyntheticUtilityApiProxy(config) || config.proxyRequiresAuth !== false
  );
}

export function validateSyntheticUtilityApiProxyUrl(
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Proxy URL must be a valid URL";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Proxy URL must use http or https";
  }

  return null;
}

export function resolveSyntheticUtilityApiBaseUrl(proxyUrl?: string): string {
  const raw = proxyUrl?.trim() || DEFAULT_SYNTHETIC_API_BASE_URL;
  const error = validateSyntheticUtilityApiProxyUrl(raw);
  if (error) {
    throw new Error(`Synthetic utility API: ${error}`);
  }
  return raw.replace(/\/+$/, "");
}

export function syntheticUtilityApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function formatSyntheticUtilityApiProxySummary(
  config: SyntheticUtilityApiConfig,
): string {
  if (!hasSyntheticUtilityApiProxy(config)) return "direct";
  const auth = syntheticUtilityApiRequiresAuth(config) ? "auth" : "no auth";
  return `${config.proxyUrl?.trim()} · ${auth}`;
}

export interface ResolvedSyntheticUtilityApiAuth {
  apiKey: string | undefined;
  requiresAuth: boolean;
}

/**
 * Resolve the auth state for a utility API request.
 *
 * - When auth is required (direct calls, or proxy with auth enabled), the
 *   provided `getApiKey` callback is awaited. Returns `null` if no key is
 *   available, so callers can surface a missing-credentials error.
 * - When auth is not required (unauthenticated proxy), `apiKey` is left
 *   `undefined` and the Synthetic API key check is skipped.
 */
export async function resolveSyntheticUtilityApiAuth(
  config: SyntheticUtilityApiConfig,
  getApiKey: () => Promise<string | undefined>,
): Promise<ResolvedSyntheticUtilityApiAuth | null> {
  const requiresAuth = syntheticUtilityApiRequiresAuth(config);
  const apiKey = requiresAuth ? await getApiKey() : undefined;
  if (requiresAuth && !apiKey) return null;
  return { apiKey, requiresAuth };
}
