import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYNTHETIC_API_BASE_URL,
  formatSyntheticUtilityApiProxySummary,
  resolveSyntheticUtilityApiAuth,
  resolveSyntheticUtilityApiBaseUrl,
  syntheticUtilityApiRequiresAuth,
  syntheticUtilityApiUrl,
  validateSyntheticUtilityApiProxyUrl,
} from "./utility-api";

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

describe("resolveSyntheticUtilityApiAuth", () => {
  it("requires the key for direct calls and skips it for authless proxies", async () => {
    const getApiKey = async () => "synthetic-key";

    const direct = await resolveSyntheticUtilityApiAuth({}, getApiKey);
    expect(direct).toEqual({ apiKey: "synthetic-key", requiresAuth: true });

    const authless = await resolveSyntheticUtilityApiAuth(
      { proxyUrl: "https://proxy.example.com", proxyRequiresAuth: false },
      getApiKey,
    );
    expect(authless).toEqual({ apiKey: undefined, requiresAuth: false });
  });

  it("returns null when auth is required but no key is available", async () => {
    const result = await resolveSyntheticUtilityApiAuth(
      {},
      async () => undefined,
    );
    expect(result).toBeNull();
  });

  it("does not invoke the key resolver for authless proxies", async () => {
    let called = false;
    const getApiKey = async () => {
      called = true;
      return "should-not-be-called";
    };

    const result = await resolveSyntheticUtilityApiAuth(
      { proxyUrl: "https://proxy.example.com", proxyRequiresAuth: false },
      getApiKey,
    );
    expect(result).toEqual({ apiKey: undefined, requiresAuth: false });
    expect(called).toBe(false);
  });
});
