import type { ProjectionHint, QuotasResponse } from "../types/quotas";

/**
 * Refill-aware projection for the Synthetic 5-hour rolling request window.
 *
 * This is a port of the burn-vs-refill projection from the pi-harness
 * `models/usage/history.ts`, adapted to pi-synthetic's data model. The 5-hour
 * window refills in discrete ticks but the API only exposes `nextTickAt` (the
 * next scheduled tick), not the full window rollover. That makes pace-based
 * projection unusable (elapsed would be ~100% since `resetsAt = nextTickAt` is
 * always near), so this window uses `showPace: false` and falls back to static
 * thresholds. Without refill awareness, an imminent tick causes a false
 * threshold bounce (82% -> tick lands -> 77%) that re-fires warnings.
 *
 * Instead of hardcoding the tick cadence, we deduce it from the invariant
 * "all ticks in the window fully refill the quota":
 *
 *   tickAmount * (windowDuration / interval) = capacity
 *   tickAmount = tickPercent * capacity          (per the Synthetic API)
 *   => interval = tickPercent * windowDuration
 *
 * The burn rate is derived from two samples >= MIN_SAMPLE_SEPARATION_MS apart:
 * the difference between how much `remaining` actually moved and how much it
 * should have moved from refills alone is gross consumption. Net drain is
 * burn - refill, and we project `remaining` forward over a 1-hour horizon
 * (see PROJECTION_HORIZON_MS).
 *
 * When there are fewer than two samples (or none >=5 min apart), no hint is
 * produced and callers fall back to raw usage thresholds.
 */

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
/** How far ahead to project usage. Tuned for warning lead-time: long enough to
 * give a meaningful severity gradient (exhausting within the horizon -> 100%
 * -> critical; slower drain -> high/warning), short enough to avoid crying
 * wolf. Aligns with the 60-minute warning cooldown so a re-warn reflects a
 * fresh hour of projected drain. */
const PROJECTION_HORIZON_MS = FIVE_HOUR_MS / 5; // 1 hour
const MIN_SAMPLE_SEPARATION_MS = 5 * 60_000;
const MAX_HISTORY_AGE_MS = 72 * 60 * 60 * 1000;

/** Quota window id that this projection targets. */
export const ROLLING_FIVE_HOUR_ID = "rollingFiveHourLimit" as const;

/** Minimal snapshot view: the projection only needs quotas + timestamp. */
export interface ProjectionSnapshot {
  quotas: QuotasResponse;
  updatedAt: number; // epoch ms
}

interface Sample {
  at: number;
  remaining: number;
  capacity: number;
  refillAmount: number;
  refillIntervalMs: number;
}

/**
 * Build refill-aware projection hints from recent snapshots.
 *
 * @param snapshots - recent quota snapshots (oldest first is not required;
 *   they are sorted internally by timestamp).
 * @returns hints keyed by quota window id. Currently only
 *   `rollingFiveHourLimit` is produced.
 */
export function buildProjectionHints(
  snapshots: readonly ProjectionSnapshot[],
): Map<string, ProjectionHint> {
  const hints = new Map<string, ProjectionHint>();
  const samples = samplesFromSnapshots(snapshots);
  if (samples.length < 2) return hints;

  const current = samples[samples.length - 1];
  const hint = projectionForSample(current, samples);
  if (hint) hints.set(ROLLING_FIVE_HOUR_ID, hint);
  return hints;
}

function samplesFromSnapshots(
  snapshots: readonly ProjectionSnapshot[],
): Sample[] {
  const out: Sample[] = [];
  for (const snap of snapshots) {
    const q = snap.quotas.rollingFiveHourLimit;
    if (!q || q.max <= 0) continue;
    // tickPercent is a fraction (e.g. 0.05 = 5% per tick). A value > 1 would
    // mean a single tick refills more than the whole quota, which is
    // nonsensical; skip to avoid a bogus deduced interval.
    const tickFraction = q.tickPercent;
    if (!(tickFraction > 0) || tickFraction > 1) continue;
    const refillAmount = tickFraction * q.max;
    const refillIntervalMs = tickFraction * FIVE_HOUR_MS;
    if (refillAmount <= 0 || refillIntervalMs <= 0) continue;
    out.push({
      at: snap.updatedAt,
      remaining: q.remaining,
      capacity: q.max,
      refillAmount,
      refillIntervalMs,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

function projectionForSample(
  current: Sample,
  samples: readonly Sample[],
): ProjectionHint | null {
  const currentAt = current.at;
  const minAt = currentAt - MAX_HISTORY_AGE_MS;

  // Most recent sample for the same capacity that is at least
  // MIN_SAMPLE_SEPARATION_MS older than the current one.
  let previous: Sample | undefined;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    if (s.capacity !== current.capacity) continue;
    if (s.at < currentAt - MIN_SAMPLE_SEPARATION_MS && s.at >= minAt) {
      previous = s;
      break;
    }
  }
  if (!previous) return null;

  const dtMs = currentAt - previous.at;
  if (dtMs <= 0) return null;

  const refillRate = current.refillAmount / current.refillIntervalMs;
  const expectedRefill = refillRate * dtMs;
  const deltaRemaining = current.remaining - previous.remaining;
  const grossBurn = Math.max(0, expectedRefill - deltaRemaining);
  const burnRate = grossBurn / dtMs;
  const netDrainRate = burnRate - refillRate;

  if (netDrainRate <= 0) return { kind: "stable" };

  // Project one hour forward: where will usage be at the current net drain
  // rate, accounting for refill? The horizon saturates at 100% (critical) when
  // exhaustion is within the horizon, and gives a gentle gradient beyond that.
  const horizonMs = PROJECTION_HORIZON_MS;
  const projectedRemaining = clamp(
    current.remaining - netDrainRate * horizonMs,
    0,
    current.capacity,
  );
  return {
    kind: "projected",
    usedPercent: Math.round((1 - projectedRemaining / current.capacity) * 100),
    horizonMs,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
