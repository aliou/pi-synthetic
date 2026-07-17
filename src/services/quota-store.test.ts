import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { QuotasResponse } from "../types/quotas";
import { QuotaStore } from "./quota-store";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QuotaStore", () => {
  const sampleQuotas: QuotasResponse = {
    subscription: { limit: 100, requests: 5, renewsAt: "2026-01-01T00:00:00Z" },
  };

  describe("ingest", () => {
    it("stores and emits API-sourced data", () => {
      const store = new QuotaStore();
      const received: QuotasResponse[] = [];
      store.subscribe((snap) => received.push(snap.quotas));

      const result = store.ingest(sampleQuotas, "api");

      expect(result).toBe(true);
      expect(store.getSnapshot()?.quotas).toBe(sampleQuotas);
      expect(store.getSnapshot()?.source).toBe("api");
      expect(received).toHaveLength(1);
    });

    it("stores and emits header-sourced data", () => {
      const store = new QuotaStore();
      const result = store.ingest(sampleQuotas, "header");

      expect(result).toBe(true);
      expect(store.getSnapshot()?.source).toBe("header");
    });

    it("throttles header ingestion within throttle window", () => {
      const store = new QuotaStore();
      store.ingest(sampleQuotas, "header");

      // Within throttle window — should be dropped
      const result = store.ingest(sampleQuotas, "header");
      expect(result).toBe(false);

      // Advance past throttle
      vi.advanceTimersByTime(store.headerThrottleMs + 1);
      const result2 = store.ingest(sampleQuotas, "header");
      expect(result2).toBe(true);
    });

    it("does NOT throttle API ingestion", () => {
      const store = new QuotaStore();
      store.ingest(sampleQuotas, "api");

      // API is never throttled
      const result = store.ingest(sampleQuotas, "api");
      expect(result).toBe(true);
    });

    it("header after API emit always goes through", () => {
      const store = new QuotaStore();
      store.ingest(sampleQuotas, "api");

      // Header 1ms after API should not be blocked
      vi.advanceTimersByTime(1);
      const result = store.ingest(sampleQuotas, "header");
      expect(result).toBe(true);
    });

    it("updates timestamp on each successful ingest", () => {
      const store = new QuotaStore();
      store.ingest(sampleQuotas, "api");
      const snap1 = store.getSnapshot();
      assert(snap1);
      const t1 = snap1.updatedAt;

      vi.advanceTimersByTime(10_000);
      store.ingest(sampleQuotas, "api");
      const snap2 = store.getSnapshot();
      assert(snap2);
      const t2 = snap2.updatedAt;

      expect(t2).toBeGreaterThan(t1);
    });
  });

  describe("subscribe", () => {
    it("notifies subscribers on ingest", () => {
      const store = new QuotaStore();
      const calls: QuotasResponse[] = [];
      store.subscribe((snap) => calls.push(snap.quotas));

      store.ingest(sampleQuotas, "api");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(sampleQuotas);
    });

    it("does not notify on throttled ingest", () => {
      const store = new QuotaStore();
      const calls: QuotasResponse[] = [];
      store.subscribe((snap) => calls.push(snap.quotas));

      store.ingest(sampleQuotas, "header");
      store.ingest(sampleQuotas, "header"); // throttled

      expect(calls).toHaveLength(1);
    });

    it("unsubscribes when unsubscribe function is called", () => {
      const store = new QuotaStore();
      const calls: QuotasResponse[] = [];
      const unsub = store.subscribe((snap) => calls.push(snap.quotas));

      unsub();
      store.ingest(sampleQuotas, "api");

      expect(calls).toHaveLength(0);
    });

    it("supports multiple subscribers", () => {
      const store = new QuotaStore();
      const calls1: QuotasResponse[] = [];
      const calls2: QuotasResponse[] = [];
      store.subscribe((snap) => calls1.push(snap.quotas));
      store.subscribe((snap) => calls2.push(snap.quotas));

      store.ingest(sampleQuotas, "api");

      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
    });
  });

  describe("refreshFromApi", () => {
    it("calls the fetcher and ingests the result", async () => {
      const store = new QuotaStore();
      const fetcher = vi.fn().mockResolvedValue(sampleQuotas);

      const result = await store.refreshFromApi(fetcher);

      assert(result);
      expect(result.quotas).toBe(sampleQuotas);
      expect(result.source).toBe("api");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent calls", async () => {
      const store = new QuotaStore();
      let resolveFirst!: (v: QuotasResponse) => void;
      const first = new Promise<QuotasResponse>((r) => (resolveFirst = r));
      const fetcher = vi.fn().mockImplementation(() => first);

      // Start two concurrent refreshes
      const p1 = store.refreshFromApi(fetcher);
      const p2 = store.refreshFromApi(fetcher);

      // Only one fetcher call
      expect(fetcher).toHaveBeenCalledOnce();
      expect(store.isRefreshing).toBe(true);

      // Resolve the fetch
      resolveFirst(sampleQuotas);
      await p1;
      await p2;

      expect(store.isRefreshing).toBe(false);
    });

    it("handles fetcher returning undefined", async () => {
      const store = new QuotaStore();
      const fetcher = vi.fn().mockResolvedValue(undefined);

      const result = await store.refreshFromApi(fetcher);

      expect(result).toBeUndefined();
      expect(store.getSnapshot()).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const store = new QuotaStore();
      store.ingest(sampleQuotas, "api");

      store.clear();

      expect(store.getSnapshot()).toBeUndefined();
    });

    it("resets header throttle after clear", () => {
      const store = new QuotaStore();
      store.ingest(sampleQuotas, "header");
      expect(store.ingest(sampleQuotas, "header")).toBe(false);

      store.clear();

      expect(store.ingest(sampleQuotas, "header")).toBe(true);
    });
  });
});
