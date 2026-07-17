import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { QuotasResponse } from "../types/quotas";
import type { ProjectionSnapshot } from "../utils/quotas-projection";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_MS = 14 * DAY_MS;
const DEFAULT_MIN_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const MAX_MEMORY_SNAPSHOTS = 5_000;
const MAX_LINE_BYTES = 16 * 1024;
const HISTORY_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

interface PersistedQuotaHistoryEntry {
  version: 1;
  recordedAt: string;
  quotas: QuotasResponse;
}

type WeeklyQuota = NonNullable<QuotasResponse["weeklyTokenLimit"]>;
type RollingQuota = NonNullable<QuotasResponse["rollingFiveHourLimit"]>;

export interface QuotaHistoryOptions {
  /** Override the state directory. `null` disables disk persistence. */
  directory?: string | null;
  now?: () => number;
  retentionMs?: number;
  minWriteIntervalMs?: number;
  heartbeatIntervalMs?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
}

interface HistoryFile {
  name: string;
  path: string;
  size: number;
}

/**
 * Feature-scoped persistent quota history.
 *
 * Construction performs no filesystem work. Call `initialize()` only after
 * quota warnings are enabled. The directory is created lazily on the first
 * persisted snapshot, so users who never enable warnings get no state files.
 */
export class QuotaHistory {
  private readonly directory: string | undefined;
  private readonly now: () => number;
  private readonly retentionMs: number;
  private readonly minWriteIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly maxTotalBytes: number;
  private readonly maxFileBytes: number;
  private snapshots: ProjectionSnapshot[] = [];
  private initializePromise: Promise<void> | undefined;
  private initialized = false;
  private lastPersistedAt = 0;
  private lastPersistedSignature: string | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: QuotaHistoryOptions = {}) {
    this.directory =
      options.directory === null
        ? undefined
        : (options.directory ?? defaultQuotaHistoryDirectory());
    this.now = options.now ?? Date.now;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    this.minWriteIntervalMs =
      options.minWriteIntervalMs ?? DEFAULT_MIN_WRITE_INTERVAL_MS;
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  }

  /** Load retained samples without creating the history directory. */
  initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.load();
    }
    return this.initializePromise;
  }

  /** Current retained snapshots, ordered oldest first. */
  getSnapshots(): readonly ProjectionSnapshot[] {
    return this.snapshots;
  }

  /**
   * Add a live snapshot and queue a bounded disk append when sampling rules
   * allow it. Callers must await `initialize()` before recording.
   */
  record(snapshot: ProjectionSnapshot): void {
    if (!this.initialized) return;

    const quotas = projectionQuotas(snapshot.quotas);
    if (!hasProjectionQuotas(quotas)) return;

    const normalized: ProjectionSnapshot = {
      quotas,
      updatedAt: snapshot.updatedAt,
    };
    const signature = JSON.stringify(quotas);
    const previous = this.snapshots[this.snapshots.length - 1];
    if (
      !previous ||
      previous.updatedAt !== normalized.updatedAt ||
      JSON.stringify(previous.quotas) !== signature
    ) {
      this.snapshots.push(normalized);
      this.pruneMemory();
    }

    const elapsed = normalized.updatedAt - this.lastPersistedAt;
    const unchanged = signature === this.lastPersistedSignature;
    if (elapsed < this.minWriteIntervalMs) return;
    if (unchanged && elapsed < this.heartbeatIntervalMs) return;

    const entry: PersistedQuotaHistoryEntry = {
      version: 1,
      recordedAt: new Date(normalized.updatedAt).toISOString(),
      quotas,
    };
    const line = `${JSON.stringify(entry)}\n`;
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) return;

    this.lastPersistedAt = normalized.updatedAt;
    this.lastPersistedSignature = signature;
    this.writeQueue = this.writeQueue
      .then(() => this.append(entry.recordedAt, line))
      .catch(() => undefined);
  }

  /** Wait for queued writes. */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private async load(): Promise<void> {
    try {
      if (!this.directory) return;
      await this.pruneForAppend(0, this.now());
      const files = await this.listHistoryFiles();
      const cutoff = this.now() - this.retentionMs;
      const loaded: ProjectionSnapshot[] = [];

      for (const file of files) {
        if (file.size > this.maxFileBytes) continue;
        const text = await readFile(file.path, "utf8");
        for (const line of text.split("\n")) {
          if (!line.trim() || Buffer.byteLength(line) > MAX_LINE_BYTES)
            continue;
          const snapshot = parseHistoryLine(line);
          if (!snapshot || snapshot.updatedAt < cutoff) continue;
          loaded.push(snapshot);
        }
      }

      loaded.sort((a, b) => a.updatedAt - b.updatedAt);
      this.snapshots = loaded.slice(-MAX_MEMORY_SNAPSHOTS);
      const latest = this.snapshots[this.snapshots.length - 1];
      if (latest) {
        this.lastPersistedAt = latest.updatedAt;
        this.lastPersistedSignature = JSON.stringify(latest.quotas);
      }
    } catch {
      // History is best-effort. A missing/corrupt/unreadable state directory
      // must never prevent quota warnings from using live data.
      this.snapshots = [];
    } finally {
      this.initialized = true;
    }
  }

  private pruneMemory(): void {
    const cutoff = this.now() - this.retentionMs;
    this.snapshots = this.snapshots
      .filter((snapshot) => snapshot.updatedAt >= cutoff)
      .slice(-MAX_MEMORY_SNAPSHOTS);
  }

  private async append(recordedAt: string, line: string): Promise<void> {
    if (!this.directory) return;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });

    const lineBytes = Buffer.byteLength(line);
    const hasCapacity = await this.pruneForAppend(lineBytes, this.now());
    if (!hasCapacity) return;

    const path = join(this.directory, historyFileName(recordedAt));
    const currentSize = await fileSize(path);
    if (currentSize + lineBytes > this.maxFileBytes) return;

    await appendFile(path, line, {
      encoding: "utf8",
      flag: "a",
      mode: 0o600,
    });
  }

  private async pruneForAppend(
    incomingBytes: number,
    now: number,
  ): Promise<boolean> {
    const files = await this.listHistoryFiles();
    if (files.length === 0) return incomingBytes <= this.maxTotalBytes;

    const cutoff = now - this.retentionMs;
    const retained: HistoryFile[] = [];
    for (const file of files) {
      if (historyFileEnd(file.name) < cutoff || file.size > this.maxFileBytes) {
        await rm(file.path, { force: true });
      } else {
        retained.push(file);
      }
    }

    let totalBytes = retained.reduce((total, file) => total + file.size, 0);
    for (const file of retained) {
      if (totalBytes + incomingBytes <= this.maxTotalBytes) break;
      await rm(file.path, { force: true });
      totalBytes -= file.size;
    }
    return totalBytes + incomingBytes <= this.maxTotalBytes;
  }

  private async listHistoryFiles(): Promise<HistoryFile[]> {
    if (!this.directory) return [];
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return [];
    }

    const files: HistoryFile[] = [];
    for (const name of names.filter((name) =>
      HISTORY_FILE_PATTERN.test(name),
    )) {
      const path = join(this.directory, name);
      try {
        const metadata = await stat(path);
        if (metadata.isFile()) files.push({ name, path, size: metadata.size });
      } catch (error) {
        // A concurrently removed or unreadable file can be ignored.
        void error;
      }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function defaultQuotaHistoryDirectory(): string | undefined {
  const explicitStateHome = process.env.XDG_STATE_HOME?.trim();
  if (explicitStateHome) {
    return join(explicitStateHome, "pi-synthetic", "quota-history");
  }
  return join(getAgentDir(), "state", "pi-synthetic", "quota-history");
}

function projectionQuotas(quotas: QuotasResponse): QuotasResponse {
  const projected: QuotasResponse = {};
  if (quotas.weeklyTokenLimit) {
    projected.weeklyTokenLimit = { ...quotas.weeklyTokenLimit };
  }
  if (quotas.rollingFiveHourLimit) {
    projected.rollingFiveHourLimit = { ...quotas.rollingFiveHourLimit };
  }
  return projected;
}

function hasProjectionQuotas(quotas: QuotasResponse): boolean {
  return !!(quotas.weeklyTokenLimit || quotas.rollingFiveHourLimit);
}

function parseHistoryLine(line: string): ProjectionSnapshot | undefined {
  try {
    const value = JSON.parse(line) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    const entry = value as Partial<PersistedQuotaHistoryEntry>;
    if (entry.version !== 1 || typeof entry.recordedAt !== "string") {
      return undefined;
    }
    if (
      typeof entry.quotas !== "object" ||
      entry.quotas === null ||
      Array.isArray(entry.quotas)
    ) {
      return undefined;
    }
    const updatedAt = Date.parse(entry.recordedAt);
    if (!Number.isFinite(updatedAt)) return undefined;
    const quotas = parseProjectionQuotas(entry.quotas);
    if (!hasProjectionQuotas(quotas)) return undefined;
    return { quotas, updatedAt };
  } catch {
    return undefined;
  }
}

function parseProjectionQuotas(value: QuotasResponse): QuotasResponse {
  const quotas: QuotasResponse = {};
  const weekly = parseWeeklyQuota(value.weeklyTokenLimit);
  if (weekly) quotas.weeklyTokenLimit = weekly;
  const rolling = parseRollingQuota(value.rollingFiveHourLimit);
  if (rolling) quotas.rollingFiveHourLimit = rolling;
  return quotas;
}

function parseWeeklyQuota(value: unknown): WeeklyQuota | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const quota = value as Record<string, unknown>;
  if (
    typeof quota.nextRegenAt !== "string" ||
    typeof quota.percentRemaining !== "number" ||
    typeof quota.maxCredits !== "string" ||
    typeof quota.remainingCredits !== "string" ||
    typeof quota.nextRegenCredits !== "string"
  ) {
    return undefined;
  }
  return {
    nextRegenAt: quota.nextRegenAt,
    percentRemaining: quota.percentRemaining,
    maxCredits: quota.maxCredits,
    remainingCredits: quota.remainingCredits,
    nextRegenCredits: quota.nextRegenCredits,
  };
}

function parseRollingQuota(value: unknown): RollingQuota | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const quota = value as Record<string, unknown>;
  if (
    typeof quota.nextTickAt !== "string" ||
    typeof quota.tickPercent !== "number" ||
    typeof quota.remaining !== "number" ||
    typeof quota.max !== "number" ||
    typeof quota.limited !== "boolean"
  ) {
    return undefined;
  }
  return {
    nextTickAt: quota.nextTickAt,
    tickPercent: quota.tickPercent,
    remaining: quota.remaining,
    max: quota.max,
    limited: quota.limited,
  };
}

function historyFileName(recordedAt: string): string {
  return `${recordedAt.slice(0, 10)}.jsonl`;
}

function historyFileEnd(name: string): number {
  const start = Date.parse(`${name.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(start) ? start + DAY_MS : 0;
}

async function fileSize(path: string): Promise<number> {
  try {
    const metadata = await stat(path);
    return metadata.size;
  } catch {
    return 0;
  }
}
