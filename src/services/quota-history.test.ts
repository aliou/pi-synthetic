import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QuotasResponse } from "../types/quotas";
import { QuotaHistory } from "./quota-history";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryHistoryPath(): Promise<{
  root: string;
  history: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "pi-synthetic-history-"));
  tempDirectories.push(root);
  return { root, history: join(root, "nested", "quota-history") };
}

function weeklyQuotas(remainingCredits: string): QuotasResponse {
  return {
    weeklyTokenLimit: {
      nextRegenAt: "2026-07-06T00:00:00.000Z",
      percentRemaining: 50,
      maxCredits: "$15.12",
      remainingCredits,
      nextRegenCredits: "$2.16",
    },
  };
}

describe("QuotaHistory", () => {
  it("does not create a directory during construction or initialization", async () => {
    const { history } = await temporaryHistoryPath();
    const quotaHistory = new QuotaHistory({ directory: history });

    expect(existsSync(history)).toBe(false);
    await quotaHistory.initialize();
    expect(existsSync(history)).toBe(false);
  });

  it("creates a daily JSONL file only after recording", async () => {
    const { history } = await temporaryHistoryPath();
    const now = Date.parse("2026-07-05T12:00:00.000Z");
    const quotaHistory = new QuotaHistory({
      directory: history,
      now: () => now,
    });
    await quotaHistory.initialize();

    quotaHistory.record({ quotas: weeklyQuotas("$7.56"), updatedAt: now });
    await quotaHistory.flush();

    const files = await readdir(history);
    expect(files).toEqual(["2026-07-05.jsonl"]);
    const text = await readFile(join(history, "2026-07-05.jsonl"), "utf8");
    const entry = JSON.parse(text.trim());
    expect(entry).toMatchObject({
      version: 1,
      recordedAt: "2026-07-05T12:00:00.000Z",
      quotas: {
        weeklyTokenLimit: {
          remainingCredits: "$7.56",
        },
      },
    });
  });

  it("throttles changed samples and writes unchanged heartbeats hourly", async () => {
    const { history } = await temporaryHistoryPath();
    let now = Date.parse("2026-07-05T12:00:00.000Z");
    const quotaHistory = new QuotaHistory({
      directory: history,
      now: () => now,
    });
    await quotaHistory.initialize();

    quotaHistory.record({ quotas: weeklyQuotas("$7.56"), updatedAt: now });
    now += MINUTE_MS;
    quotaHistory.record({ quotas: weeklyQuotas("$7.00"), updatedAt: now });
    now += 4 * MINUTE_MS;
    quotaHistory.record({ quotas: weeklyQuotas("$6.50"), updatedAt: now });
    now += 60 * MINUTE_MS;
    quotaHistory.record({ quotas: weeklyQuotas("$6.50"), updatedAt: now });
    await quotaHistory.flush();

    const text = await readFile(join(history, "2026-07-05.jsonl"), "utf8");
    expect(text.trim().split("\n")).toHaveLength(3);
  });

  it("loads valid retained entries and ignores malformed lines", async () => {
    const { history } = await temporaryHistoryPath();
    const now = Date.parse("2026-07-05T12:00:00.000Z");
    await mkdir(history, { recursive: true });
    await writeFile(
      join(history, "2026-07-05.jsonl"),
      [
        "not-json",
        JSON.stringify({ version: 99, recordedAt: new Date(now), quotas: {} }),
        JSON.stringify({
          version: 1,
          recordedAt: new Date(now - DAY_MS).toISOString(),
          quotas: weeklyQuotas("$8.00"),
        }),
      ].join("\n"),
    );

    const quotaHistory = new QuotaHistory({
      directory: history,
      now: () => now,
    });
    await quotaHistory.initialize();

    expect(quotaHistory.getSnapshots()).toHaveLength(1);
    expect(
      quotaHistory.getSnapshots()[0].quotas.weeklyTokenLimit?.remainingCredits,
    ).toBe("$8.00");
  });

  it("prunes files outside the retention window", async () => {
    const { history } = await temporaryHistoryPath();
    const now = Date.parse("2026-07-20T12:00:00.000Z");
    await mkdir(history, { recursive: true });
    await writeFile(join(history, "2026-07-01.jsonl"), "old\n");
    await writeFile(join(history, "2026-07-20.jsonl"), "current\n");

    const quotaHistory = new QuotaHistory({
      directory: history,
      now: () => now,
    });
    await quotaHistory.initialize();

    const files = await readdir(history);
    expect(files).toEqual(["2026-07-20.jsonl"]);
  });

  it("prunes retained daily files above the per-file cap", async () => {
    const { history } = await temporaryHistoryPath();
    const now = Date.parse("2026-07-20T12:00:00.000Z");
    await mkdir(history, { recursive: true });
    await writeFile(join(history, "2026-07-20.jsonl"), "x".repeat(301));

    const quotaHistory = new QuotaHistory({
      directory: history,
      now: () => now,
      maxFileBytes: 300,
    });
    await quotaHistory.initialize();

    const files = await readdir(history);
    expect(files).toEqual([]);
  });

  it("evicts oldest files before exceeding the total byte cap", async () => {
    const { history } = await temporaryHistoryPath();
    const now = Date.parse("2026-07-05T12:00:00.000Z");
    await mkdir(history, { recursive: true });
    await writeFile(join(history, "2026-07-03.jsonl"), "x".repeat(300));
    await writeFile(join(history, "2026-07-04.jsonl"), "x".repeat(300));

    const quotaHistory = new QuotaHistory({
      directory: history,
      now: () => now,
      maxTotalBytes: 700,
      maxFileBytes: 600,
    });
    await quotaHistory.initialize();
    quotaHistory.record({ quotas: weeklyQuotas("$7.56"), updatedAt: now });
    await quotaHistory.flush();

    const files = await readdir(history);
    expect(files).not.toContain("2026-07-03.jsonl");
    const sizes = await Promise.all(
      files.map(async (name) => {
        const contents = await readFile(join(history, name));
        return contents.byteLength;
      }),
    );
    expect(sizes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(
      700,
    );
  });
});
