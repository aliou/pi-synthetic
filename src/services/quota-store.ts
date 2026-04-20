import type { QuotaSource, QuotasResponse } from "../types/quotas";

export interface QuotaSnapshot {
  quotas: QuotasResponse;
  source: QuotaSource;
  updatedAt: number; // epoch ms
}

type Listener = (snapshot: QuotaSnapshot) => void;

/**
 * Pi-agnostic in-memory quota store.
 *
 * Ingests quota data from headers or API, handles throttling of
 * header-sourced updates, and notifies subscribers on change.
 *
 * Usage:
 *   const store = new QuotaStore();
 *   store.subscribe((snap) => { ... });
 *   store.ingest(quotas, "header");
 *   store.ingest(quotas, "api");
 */
export class QuotaStore {
  private snapshot: QuotaSnapshot | undefined;
  private listeners = new Set<Listener>();
  private lastHeaderIngestAt = 0;
  private inFlightRefresh: Promise<QuotaSnapshot | undefined> | undefined;

  /** Throttle header ingestion: skip if last header ingest was within this window. */
  headerThrottleMs = 5_000;

  /** Current snapshot (may be undefined if no data has been ingested yet). */
  getSnapshot(): QuotaSnapshot | undefined {
    return this.snapshot;
  }

  /** Subscribe to snapshot updates. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(snapshot: QuotaSnapshot): void {
    for (const l of this.listeners) l(snapshot);
  }

  /**
   * Ingest quota data. Returns true if the snapshot was updated
   * (i.e. not throttled).
   *
   * Header-sourced data is throttled: if the last header ingest was
   * within `headerThrottleMs`, it is silently dropped.
   * API-sourced data always goes through.
   */
  ingest(quotas: QuotasResponse, source: QuotaSource): boolean {
    const now = Date.now();

    if (source === "header") {
      if (now - this.lastHeaderIngestAt < this.headerThrottleMs) return false;
      this.lastHeaderIngestAt = now;
    }

    this.snapshot = { quotas, source, updatedAt: now };
    this.emit(this.snapshot);
    return true;
  }

  /**
   * Refresh quotas by calling the provided fetcher.
   * Deduplicates concurrent calls — only one fetch runs at a time.
   */
  async refreshFromApi(
    fetcher: () => Promise<QuotasResponse | undefined>,
  ): Promise<QuotaSnapshot | undefined> {
    if (this.inFlightRefresh) return this.inFlightRefresh;

    this.inFlightRefresh = (async () => {
      try {
        const quotas = await fetcher();
        if (quotas) {
          this.ingest(quotas, "api");
        }
        return this.snapshot;
      } finally {
        this.inFlightRefresh = undefined;
      }
    })();

    return this.inFlightRefresh;
  }

  /** Returns true if a refresh is currently in flight. */
  get isRefreshing(): boolean {
    return !!this.inFlightRefresh;
  }

  /** Clear all state. Call on session shutdown or reset. */
  clear(): void {
    this.snapshot = undefined;
    this.lastHeaderIngestAt = 0;
    this.inFlightRefresh = undefined;
  }
}
