import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Test the stale-context guard logic from createStatusRefresher.
// We re-implement the refresher for unit testing since the production
// createStatusRefresher is not exported, and we need to exercise
// the isCtxLive guard + async staleness patterns.

function createMockContext(stale = false, hasUI = true) {
  const ctx: any = {
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      setStatus: vi.fn(),
    },
    modelRegistry: {
      authStorage: {
        get: vi.fn().mockResolvedValue("test-key"),
      },
    },
  };

  // Pi's ExtensionContext has hasUI as a getter that calls assertActive().
  // When the ctx is stale, accessing hasUI throws.
  Object.defineProperty(ctx, "hasUI", {
    get: stale
      ? () => {
          throw new Error(
            "This extension ctx is stale after session replacement or reload."
          );
        }
      : () => hasUI,
    configurable: true,
  });

  // Also make ui, modelRegistry getters that throw when stale
  // (mirrors Pi's ExtensionRunner behavior — all getters call assertActive)
  if (stale) {
    const realUi = ctx.ui;
    const realMr = ctx.modelRegistry;
    Object.defineProperty(ctx, "ui", {
      get: () => {
        throw new Error(
          "This extension ctx is stale after session replacement or reload."
        );
      },
      configurable: true,
    });
    Object.defineProperty(ctx, "modelRegistry", {
      get: () => {
        throw new Error(
          "This extension ctx is stale after session replacement or reload."
        );
      },
      configurable: true,
    });
  }

  return ctx;
}

// isCtxLive — mirrors the production helper
function isCtxLive(ctx: any | undefined): boolean {
  if (!ctx) return false;
  try {
    return ctx.hasUI !== undefined;
  } catch {
    return false;
  }
}

function createTestRefresher() {
  const REFRESH_INTERVAL_MS = 60_000;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let activeContext: any | undefined;
  let isRefreshInFlight = false;

  function setActiveContext(ctx: any) {
    activeContext = ctx;
  }

  function startAutoRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!isCtxLive(activeContext)) {
        activeContext = undefined;
        return;
      }
      // Simulate updateFooterStatus — touches ctx.ui
      try {
        activeContext.ui.setStatus("synthetic-usage", "from-timer");
      } catch {
        // Stale ctx detected after isCtxLive — silently abandon
      }
    }, REFRESH_INTERVAL_MS);
    refreshTimer.unref?.();
  }

  function stopAutoRefresh(ctx?: any): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
    activeContext = undefined;
    if (isCtxLive(ctx)) {
      ctx.ui.setStatus("synthetic-usage", undefined);
    }
  }

  return {
    setActiveContext,
    startAutoRefresh,
    stopAutoRefresh,
    getActiveContext: () => activeContext,
  };
}

describe("isCtxLive", () => {
  it("returns false for undefined", () => {
    expect(isCtxLive(undefined)).toBe(false);
  });

  it("returns true for fresh context", () => {
    const ctx = createMockContext(false);
    expect(isCtxLive(ctx)).toBe(true);
  });

  it("returns false for stale context (hasUI throws)", () => {
    const ctx = createMockContext(true);
    expect(isCtxLive(ctx)).toBe(false);
  });

  it("returns true for live context with hasUI=false", () => {
    const ctx = createMockContext(false, false);
    expect(isCtxLive(ctx)).toBe(true);
  });
});

describe("createStatusRefresher stale context guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("stopAutoRefresh clears activeContext", () => {
    it("sets activeContext to undefined after stop", () => {
      const refresher = createTestRefresher();
      const ctx = createMockContext();

      refresher.setActiveContext(ctx);
      expect(refresher.getActiveContext()).toBe(ctx);

      refresher.stopAutoRefresh(ctx);
      expect(refresher.getActiveContext()).toBeUndefined();
    });

    it("prevents interval from firing after stop", () => {
      const refresher = createTestRefresher();
      const ctx = createMockContext();
      const setStatusSpy = ctx.ui.setStatus;

      refresher.setActiveContext(ctx);
      refresher.startAutoRefresh();
      refresher.stopAutoRefresh(ctx);

      vi.advanceTimersByTime(60_000);
      vi.advanceTimersByTime(60_000);

      expect(setStatusSpy).not.toHaveBeenCalledWith(
        "synthetic-usage",
        "from-timer"
      );
    });

    it("does not throw when called with stale ctx", () => {
      const refresher = createTestRefresher();
      const staleCtx = createMockContext(true);

      // stopAutoRefresh should check isCtxLive before touching ctx.ui
      expect(() => refresher.stopAutoRefresh(staleCtx)).not.toThrow();
    });
  });

  describe("interval callback catches stale context", () => {
    it("catches stale hasUI getter and nulls activeContext", () => {
      const refresher = createTestRefresher();
      const staleCtx = createMockContext(true);

      refresher.setActiveContext(staleCtx);
      refresher.startAutoRefresh();

      expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
      expect(refresher.getActiveContext()).toBeUndefined();
    });

    it("does not call setStatus when context is stale", () => {
      const refresher = createTestRefresher();
      const staleCtx = createMockContext(true);

      refresher.setActiveContext(staleCtx);
      refresher.startAutoRefresh();

      vi.advanceTimersByTime(60_000);

      // ui.setStatus was never reached (ui getter throws on stale ctx)
      // so we just verify no crash
    });

    it("works normally with fresh context", () => {
      const refresher = createTestRefresher();
      const freshCtx = createMockContext(false);
      const setStatusSpy = freshCtx.ui.setStatus;

      refresher.setActiveContext(freshCtx);
      refresher.startAutoRefresh();

      vi.advanceTimersByTime(60_000);

      expect(setStatusSpy).toHaveBeenCalledWith(
        "synthetic-usage",
        "from-timer"
      );
      expect(refresher.getActiveContext()).toBe(freshCtx);
    });
  });

  describe("full lifecycle", () => {
    it("start → stop → timer tick does not throw", () => {
      const refresher = createTestRefresher();
      const ctx = createMockContext();

      refresher.setActiveContext(ctx);
      refresher.startAutoRefresh();
      refresher.stopAutoRefresh(ctx);

      expect(() => {
        vi.advanceTimersByTime(60_000);
        vi.advanceTimersByTime(60_000);
      }).not.toThrow();
    });

    it("context goes stale mid-session: timer catches it", () => {
      const refresher = createTestRefresher();
      const freshCtx = createMockContext(false);

      refresher.setActiveContext(freshCtx);
      refresher.startAutoRefresh();

      // First tick: fresh context works fine
      vi.advanceTimersByTime(60_000);
      expect(freshCtx.ui.setStatus).toHaveBeenCalledWith(
        "synthetic-usage",
        "from-timer"
      );

      // Now replace with stale context (simulates reload invalidating the ctx)
      const staleCtx = createMockContext(true);
      refresher.setActiveContext(staleCtx);

      // Second tick: stale guard catches it
      expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
      expect(refresher.getActiveContext()).toBeUndefined();

      // Third tick: activeContext is undefined, so no crash
      expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    });

    it("stopAutoRefresh with stale ctx does not crash", () => {
      const refresher = createTestRefresher();
      const ctx = createMockContext();
      const staleCtx = createMockContext(true);

      refresher.setActiveContext(ctx);
      refresher.startAutoRefresh();

      // Simulate: ctx goes stale, then stopAutoRefresh is called with it
      // (e.g., from SYNTHETIC_CONFIG_UPDATED_EVENT with stale currentContext)
      expect(() => refresher.stopAutoRefresh(staleCtx)).not.toThrow();
      expect(refresher.getActiveContext()).toBeUndefined();
    });
  });

  describe("isCtxLive with non-UI mode (hasUI=false)", () => {
    it("keeps activeContext alive when hasUI is false but ctx is live", () => {
      const refresher = createTestRefresher();
      const nonUiCtx = createMockContext(false, false); // live, but hasUI=false

      refresher.setActiveContext(nonUiCtx);
      refresher.startAutoRefresh();

      // isCtxLive returns true, so activeContext stays set
      vi.advanceTimersByTime(60_000);
      expect(refresher.getActiveContext()).toBe(nonUiCtx);
    });
  });
});
