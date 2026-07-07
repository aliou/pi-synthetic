import type {
  SyntheticClientOptions,
  SyntheticUtilityApiConfig,
} from "./types";

export const DEFAULT_SYNTHETIC_API_BASE_URL = "https://api.synthetic.new";

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

export async function resolveSyntheticClientOptions(
  config: SyntheticUtilityApiConfig,
  getApiKey: () => Promise<string | undefined>,
): Promise<SyntheticClientOptions | null> {
  const requiresAuth = syntheticUtilityApiRequiresAuth(config);
  const apiKey = requiresAuth ? await getApiKey() : undefined;
  if (requiresAuth && !apiKey) return null;

  return {
    apiKey,
    proxyUrl: config.proxyUrl,
    requiresAuth,
  };
}
