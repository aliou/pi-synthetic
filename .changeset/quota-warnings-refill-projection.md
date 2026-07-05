---
"@aliou/pi-synthetic": patch
---

Account for tick refills in 5-hour window severity so quota warnings stop firing on imminent-tick threshold bounces and still surface genuine on-pace drain. Adds a refill-aware projection (ported from pi-harness's burn-vs-refill model) that derives the burn rate from recent snapshots, subtracts the refill rate, and projects usage forward over a 1-hour horizon. The tick cadence is deduced from the invariant "all ticks in the window fully refill the quota" (`interval = tickPercent * windowDuration`), so it is not hardcoded. The `QuotaStore` now keeps a bounded in-memory snapshot buffer to compute the projection; `assessWindow` accepts an optional projection used by the warning notifier. Windows with insufficient history fall back to the existing raw-threshold behavior.
