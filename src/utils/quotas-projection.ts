import type { ProjectionHint, QuotasResponse } from "../types/quotas";
import { parseCurrency } from "./quotas-severity";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const FIVE_HOUR_MS = 5 * HOUR_MS;
const FIVE_HOUR_PROJECTION_MS = HOUR_MS;
const FIVE_HOUR_MIN_SAMPLE_MS = 5 * 60 * 1000;
const FIVE_HOUR_MAX_HISTORY_MS = 72 * HOUR_MS;
const WEEKLY_MIN_SAMPLE_MS = DAY_MS;
const WEEKLY_MAX_HISTORY_MS = 14 * DAY_MS;

export const ROLLING_FIVE_HOUR_ID = "rollingFiveHourLimit" as const;
export const WEEKLY_TOKEN_LIMIT_ID = "weeklyTokenLimit" as const;

/** Minimal snapshot view used by persistent history and projections. */
export interface ProjectionSnapshot {
  quotas: QuotasResponse;
  updatedAt: number; // epoch ms
}

interface Sample {
  id: typeof ROLLING_FIVE_HOUR_ID | typeof WEEKLY_TOKEN_LIMIT_ID;
  at: number;
  remaining: number;
  capacity: number;
  refillAmount: number;
  refillIntervalMs: number;
  minSampleSeparationMs: number;
  maxHistoryAgeMs: number;
  projectionHorizonMs: number;
}

/**
 * Build refill-aware hints for rolling requests and weekly credits.
 *
 * The 5-hour window uses samples at least five minutes apart and projects one
 * hour ahead. Weekly credits require at least a full day between samples so a
 * short burst is not extrapolated across the week; they project one day ahead.
 * If only older weekly samples are available, the most recent sample within
 * the retained 14-day history is used.
 */
export function buildProjectionHints(
  snapshots: readonly ProjectionSnapshot[],
): Map<string, ProjectionHint> {
  const hints = new Map<string, ProjectionHint>();
  const samples = samplesFromSnapshots(snapshots);

  for (const id of [ROLLING_FIVE_HOUR_ID, WEEKLY_TOKEN_LIMIT_ID] as const) {
    const matching = samples.filter((sample) => sample.id === id);
    const current = matching[matching.length - 1];
    if (!current) continue;
    const hint = projectionForSample(current, matching);
    if (hint) hints.set(id, hint);
  }

  return hints;
}

function samplesFromSnapshots(
  snapshots: readonly ProjectionSnapshot[],
): Sample[] {
  const samples: Sample[] = [];
  for (const snapshot of snapshots) {
    const rolling = rollingSample(snapshot);
    if (rolling) samples.push(rolling);
    const weekly = weeklySample(snapshot);
    if (weekly) samples.push(weekly);
  }
  return samples.sort((a, b) => a.at - b.at);
}

function rollingSample(snapshot: ProjectionSnapshot): Sample | undefined {
  const quota = snapshot.quotas.rollingFiveHourLimit;
  if (!quota || quota.max <= 0) return undefined;

  // tickPercent is a fraction (for example 0.05 = 5% per tick). All ticks in
  // a five-hour window replenish the full capacity, so the interval can be
  // deduced as tickPercent * window duration.
  const tickFraction = quota.tickPercent;
  if (!(tickFraction > 0) || tickFraction > 1) return undefined;
  const refillAmount = tickFraction * quota.max;
  const refillIntervalMs = tickFraction * FIVE_HOUR_MS;
  if (refillAmount <= 0 || refillIntervalMs <= 0) return undefined;

  return {
    id: ROLLING_FIVE_HOUR_ID,
    at: snapshot.updatedAt,
    remaining: quota.remaining,
    capacity: quota.max,
    refillAmount,
    refillIntervalMs,
    minSampleSeparationMs: FIVE_HOUR_MIN_SAMPLE_MS,
    maxHistoryAgeMs: FIVE_HOUR_MAX_HISTORY_MS,
    projectionHorizonMs: FIVE_HOUR_PROJECTION_MS,
  };
}

function weeklySample(snapshot: ProjectionSnapshot): Sample | undefined {
  const quota = snapshot.quotas.weeklyTokenLimit;
  if (!quota) return undefined;
  const capacity = parseCurrency(quota.maxCredits);
  const remaining = parseCurrency(quota.remainingCredits);
  if (capacity <= 0 || remaining < 0) return undefined;

  // Weekly credits replenish by one full capacity over seven days. Requiring
  // a one-day observation interval includes a complete daily regen cycle and
  // prevents a single request burst from driving the weekly projection.
  return {
    id: WEEKLY_TOKEN_LIMIT_ID,
    at: snapshot.updatedAt,
    remaining,
    capacity,
    refillAmount: capacity,
    refillIntervalMs: WEEK_MS,
    minSampleSeparationMs: WEEKLY_MIN_SAMPLE_MS,
    maxHistoryAgeMs: WEEKLY_MAX_HISTORY_MS,
    projectionHorizonMs: DAY_MS,
  };
}

function projectionForSample(
  current: Sample,
  samples: readonly Sample[],
): ProjectionHint | null {
  const minAt = current.at - current.maxHistoryAgeMs;
  let previous: Sample | undefined;
  for (let index = samples.length - 1; index >= 0; index--) {
    const sample = samples[index];
    if (sample.id !== current.id || sample.capacity !== current.capacity) {
      continue;
    }
    if (
      sample.at <= current.at - current.minSampleSeparationMs &&
      sample.at >= minAt
    ) {
      previous = sample;
      break;
    }
  }
  if (!previous) return null;

  const elapsedMs = current.at - previous.at;
  if (elapsedMs <= 0) return null;

  const refillRate = current.refillAmount / current.refillIntervalMs;
  const expectedRefill = refillRate * elapsedMs;
  const remainingDelta = current.remaining - previous.remaining;
  const grossBurn = Math.max(0, expectedRefill - remainingDelta);
  const netDrainRate = grossBurn / elapsedMs - refillRate;
  if (netDrainRate <= 0) return { kind: "stable" };

  const projectedRemaining = clamp(
    current.remaining - netDrainRate * current.projectionHorizonMs,
    0,
    current.capacity,
  );
  return {
    kind: "projected",
    usedPercent: Math.round((1 - projectedRemaining / current.capacity) * 100),
    horizonMs: current.projectionHorizonMs,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
