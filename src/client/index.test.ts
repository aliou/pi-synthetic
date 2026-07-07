import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SYNTHETIC_API_BASE_URL,
  formatSyntheticUtilityApiProxySummary,
  resolveSyntheticClientOptions,
  resolveSyntheticUtilityApiBaseUrl,
  SyntheticClient,
  type SyntheticClientOptions,
  syntheticUtilityApiRequiresAuth,
  validateSyntheticUtilityApiProxyUrl,
} from "./index";
import { syntheticUtilityApiUrl } from "./utility-api";

const QUOTAS_BODY = {
  subscription: { limit: 1000, requests: 5, renewsAt: "2026-01-01T00:00:00Z" },
};

function mockFetchOk(body: unknown, capture?: (init: RequestInit) => void) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capture?.(init ?? {});
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      },
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Synthetic utility API endpoints", () => {
  it("uses the Synthetic API when no proxy is configured", () => {
    expect(resolveSyntheticUtilityApiBaseUrl()).toBe(
      DEFAULT_SYNTHETIC_API_BASE_URL,
    );
  });

  it("trims trailing slashes from proxy URLs", () => {
    expect(
      resolveSyntheticUtilityApiBaseUrl("https://proxy.example.com///"),
    ).toBe("https://proxy.example.com");
  });

  it("preserves proxy path prefixes when joining endpoint paths", () => {
    const baseUrl = resolveSyntheticUtilityApiBaseUrl(
      "https://proxy.example.com/synthetic/",
    );

    expect(syntheticUtilityApiUrl(baseUrl, "/v2/search")).toBe(
      "https://proxy.example.com/synthetic/v2/search",
    );
  });

  it("rejects unsupported proxy URL protocols", () => {
    expect(validateSyntheticUtilityApiProxyUrl("ftp://proxy.example.com")).toBe(
      "Proxy URL must use http or https",
    );
  });

  it("requires auth unless an unauthenticated proxy is configured", () => {
    expect(syntheticUtilityApiRequiresAuth({})).toBe(true);
    expect(
      syntheticUtilityApiRequiresAuth({
        proxyUrl: "https://proxy.example.com",
        proxyRequiresAuth: true,
      }),
    ).toBe(true);
    expect(
      syntheticUtilityApiRequiresAuth({
        proxyUrl: "https://proxy.example.com",
        proxyRequiresAuth: false,
      }),
    ).toBe(false);
  });

  it("summarizes proxy state for settings display", () => {
    expect(formatSyntheticUtilityApiProxySummary({})).toBe("direct");
    expect(
      formatSyntheticUtilityApiProxySummary({
        proxyUrl: "https://proxy.example.com",
        proxyRequiresAuth: true,
      }),
    ).toBe("https://proxy.example.com · auth");
    expect(
      formatSyntheticUtilityApiProxySummary({
        proxyUrl: "https://proxy.example.com",
        proxyRequiresAuth: false,
      }),
    ).toBe("https://proxy.example.com · no auth");
  });

  it("throws on invalid proxy URLs when resolving the base URL", () => {
    expect(() => resolveSyntheticUtilityApiBaseUrl("not-a-url")).toThrow(
      /Proxy URL must be a valid URL/,
    );
    expect(() =>
      resolveSyntheticUtilityApiBaseUrl("ftp://proxy.example.com"),
    ).toThrow(/Proxy URL must use http or https/);
  });
});

describe("resolveSyntheticClientOptions", () => {
  it("requires the key for direct calls and skips it for authless proxies", async () => {
    const getApiKey = vi.fn(async () => "synthetic-key");

    const direct = await resolveSyntheticClientOptions({}, getApiKey);
    expect(direct).toEqual({
      apiKey: "synthetic-key",
      proxyUrl: undefined,
      requiresAuth: true,
    });

    const authless = await resolveSyntheticClientOptions(
      { proxyUrl: "https://proxy.example.com", proxyRequiresAuth: false },
      getApiKey,
    );
    expect(authless).toEqual({
      apiKey: undefined,
      proxyUrl: "https://proxy.example.com",
      requiresAuth: false,
    });
  });

  it("returns null when auth is required but no key is available", async () => {
    const result = await resolveSyntheticClientOptions(
      {},
      async () => undefined,
    );
    expect(result).toBeNull();
  });

  it("does not invoke the key resolver for authless proxies", async () => {
    const getApiKey = vi.fn(async () => "should-not-be-called");

    const result = await resolveSyntheticClientOptions(
      { proxyUrl: "https://proxy.example.com", proxyRequiresAuth: false },
      getApiKey,
    );
    expect(result).toEqual({
      apiKey: undefined,
      proxyUrl: "https://proxy.example.com",
      requiresAuth: false,
    });
    expect(getApiKey).not.toHaveBeenCalled();
  });
});

describe("SyntheticClient.quotas", () => {
  it("targets the Synthetic API and sends Authorization by default", async () => {
    let captured: RequestInit = {};
    mockFetchOk(QUOTAS_BODY, (init) => {
      captured = init;
    });

    const result = await new SyntheticClient({
      apiKey: "synthetic-key",
      requiresAuth: true,
    } satisfies SyntheticClientOptions).quotas();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0][0]).toBe("https://api.synthetic.new/v2/quotas");
    expect(captured.headers).toEqual({
      Authorization: "Bearer synthetic-key",
    });
    expect(result.success).toBe(true);
  });

  it("targets the proxy URL and omits Authorization when auth is disabled", async () => {
    let captured: RequestInit = {};
    mockFetchOk(QUOTAS_BODY, (init) => {
      captured = init;
    });

    const result = await new SyntheticClient({
      proxyUrl: "https://proxy.example.com/synthetic/",
      requiresAuth: false,
    } satisfies SyntheticClientOptions).quotas();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0][0]).toBe("https://proxy.example.com/synthetic/v2/quotas");
    expect(captured.headers).toEqual({});
    expect(result.success).toBe(true);
  });

  it("returns a config error when auth is required but missing", async () => {
    const result = await new SyntheticClient({ requiresAuth: true }).quotas();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("config");
    }
  });

  it("returns a config error when the proxy URL is invalid", async () => {
    const result = await new SyntheticClient({
      proxyUrl: "ftp://proxy.example.com",
      requiresAuth: false,
    }).quotas();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("config");
    }
  });
});

describe("SyntheticClient.search", () => {
  it("posts the search query to the utility API", async () => {
    let captured: RequestInit = {};
    mockFetchOk({ results: [] }, (init) => {
      captured = init;
    });

    const result = await new SyntheticClient({
      apiKey: "synthetic-key",
      requiresAuth: true,
    }).search("pi extensions");

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0][0]).toBe("https://api.synthetic.new/v2/search");
    expect(captured.method).toBe("POST");
    expect(captured.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer synthetic-key",
    });
    expect(captured.body).toBe(JSON.stringify({ query: "pi extensions" }));
    expect(result).toEqual({ results: [] });
  });
});

describe("SyntheticClient.models", () => {
  it("always targets the direct Synthetic models endpoint", async () => {
    mockFetchOk({ data: [] });

    await new SyntheticClient({
      proxyUrl: "https://proxy.example.com/synthetic/",
      requiresAuth: false,
    }).models();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0][0]).toBe("https://api.synthetic.new/openai/v1/models");
  });
});
