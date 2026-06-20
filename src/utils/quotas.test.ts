import { afterEach, describe, expect, it, vi } from "vitest";
import { type FetchQuotasOptions, fetchQuotas } from "./quotas";

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

describe("fetchQuotas", () => {
  it("targets the Synthetic API and sends Authorization by default", async () => {
    let captured: RequestInit = {};
    mockFetchOk(QUOTAS_BODY, (init) => {
      captured = init;
    });

    const result = await fetchQuotas({
      apiKey: "synthetic-key",
      requiresAuth: true,
    } satisfies FetchQuotasOptions);

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

    const result = await fetchQuotas({
      proxyUrl: "https://proxy.example.com/synthetic/",
      requiresAuth: false,
    } satisfies FetchQuotasOptions);

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0][0]).toBe("https://proxy.example.com/synthetic/v2/quotas");
    expect(captured.headers).toEqual({});
    expect(result.success).toBe(true);
  });

  it("returns a config error when auth is required but missing", async () => {
    const result = await fetchQuotas({ requiresAuth: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("config");
    }
  });

  it("returns a config error when the proxy URL is invalid", async () => {
    const result = await fetchQuotas({
      proxyUrl: "ftp://proxy.example.com",
      requiresAuth: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe("config");
    }
  });
});
