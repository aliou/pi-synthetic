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
const WEEKLY_BURN_HALF_LIFE_MS = 3 * DAY_MS;

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

interface DailyBurnRates {
  latestAt: number;
  rates: number[];
}

/**
 * Build refill-aware hints for rolling requests and weekly credits.
 *
 * The 5-hour window uses samples at least five minutes apart and projects one
 * hour ahead. Weekly credits estimate absolute credit burn from daily trends,
 * including trends from older capacity tiers, then apply the current tier's
 * refill rate and project one day ahead. Capacity transitions themselves are
 * never treated as usage.
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
  const refillAmount = parseCurrency(quota.nextRegenCredits);
  if (
    capacity <= 0 ||
    remaining < 0 ||
    refillAmount <= 0 ||
    refillAmount > capacity
  ) {
    return undefined;
  }

  // All weekly regen ticks replenish one full capacity over seven days. Infer
  // this tier's tick interval from its API-provided amount rather than assuming
  // a particular subscription capacity or regen amount.
  const refillIntervalMs = (refillAmount / capacity) * WEEK_MS;
  return {
    id: WEEKLY_TOKEN_LIMIT_ID,
    at: snapshot.updatedAt,
    remaining,
    capacity,
    refillAmount,
    refillIntervalMs,
    minSampleSeparationMs: WEEKLY_MIN_SAMPLE_MS,
    maxHistoryAgeMs: WEEKLY_MAX_HISTORY_MS,
    projectionHorizonMs: DAY_MS,
  };
}

function projectionForSample(
  current: Sample,
  samples: readonly Sample[],
): ProjectionHint | null {
  if (current.id === WEEKLY_TOKEN_LIMIT_ID) {
    return weeklyProjectionForSample(current, samples);
  }

  const minAt = current.at - current.maxHistoryAgeMs;
  const previousSamples = samples.filter(
    (sample) =>
      sample.id === current.id &&
      sample.capacity === current.capacity &&
      sample.at <= current.at - current.minSampleSeparationMs &&
      sample.at >= minAt,
  );
  if (previousSamples.length === 0) return null;

  const previous = previousSamples[previousSamples.length - 1];
  const netDrainRate = netDrainRateBetween(previous, current);
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
    timeToEmptyMs: current.remaining / netDrainRate,
  };
}

function weeklyProjectionForSample(
  current: Sample,
  samples: readonly Sample[],
): ProjectionHint | null {
  const minAt = current.at - current.maxHistoryAgeMs;
  const weeklySamples = samples.filter(
    (sample) =>
      sample.id === WEEKLY_TOKEN_LIMIT_ID &&
      sample.at >= minAt &&
      sample.at <= current.at,
  );
  const ratesByDay = new Map<string, DailyBurnRates>();

  let runStart = 0;
  let baselineIndex = 0;
  for (let index = 0; index < weeklySamples.length; index++) {
    const endpoint = weeklySamples[index];
    if (index > 0 && weeklySamples[index - 1].capacity !== endpoint.capacity) {
      runStart = index;
      baselineIndex = index;
    }

    const latestBaselineAt = endpoint.at - WEEKLY_MIN_SAMPLE_MS;
    while (
      baselineIndex + 1 < index &&
      weeklySamples[baselineIndex + 1].at <= latestBaselineAt
    ) {
      baselineIndex++;
    }
    if (
      baselineIndex < runStart ||
      baselineIndex >= index ||
      weeklySamples[baselineIndex].at > latestBaselineAt
    ) {
      continue;
    }

    const rate = grossBurnRateBetween(weeklySamples[baselineIndex], endpoint);
    if (rate === undefined) continue;
    const day = new Date(endpoint.at).toISOString().slice(0, 10);
    const bucket = ratesByDay.get(day) ?? { latestAt: endpoint.at, rates: [] };
    bucket.latestAt = Math.max(bucket.latestAt, endpoint.at);
    bucket.rates.push(rate);
    ratesByDay.set(day, bucket);
  }

  if (ratesByDay.size === 0) return null;

  let weightedBurnRate = 0;
  let totalWeight = 0;
  for (const bucket of ratesByDay.values()) {
    const ageMs = Math.max(0, current.at - bucket.latestAt);
    const weight = 2 ** (-ageMs / WEEKLY_BURN_HALF_LIFE_MS);
    weightedBurnRate += median(bucket.rates) * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return null;

  const grossBurnRate = weightedBurnRate / totalWeight;
  const currentRefillRate = current.refillAmount / current.refillIntervalMs;
  const netDrainRate = grossBurnRate - currentRefillRate;
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
    timeToEmptyMs: current.remaining / netDrainRate,
  };
}

function netDrainRateBetween(previous: Sample, current: Sample): number {
  const elapsedMs = current.at - previous.at;
  const refillRate = current.refillAmount / current.refillIntervalMs;
  const expectedRefill = refillRate * elapsedMs;
  const remainingDelta = current.remaining - previous.remaining;
  const grossBurn = Math.max(0, expectedRefill - remainingDelta);
  return grossBurn / elapsedMs - refillRate;
}

function grossBurnRateBetween(
  previous: Sample,
  current: Sample,
): number | undefined {
  const elapsedMs = current.at - previous.at;
  const refillRate = current.refillAmount / current.refillIntervalMs;
  const expectedRefill = refillRate * elapsedMs;
  const refillHeadroom = Math.max(0, current.capacity - previous.remaining);
  // Once expected refill exceeds the starting headroom, some refill may have
  // been hidden by the capacity ceiling. Skip the ambiguous interval instead
  // of inventing burn from refill that may never have landed.
  if (expectedRefill > refillHeadroom) return undefined;
  const remainingDelta = current.remaining - previous.remaining;
  return Math.max(0, expectedRefill - remainingDelta) / elapsedMs;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
