---
"@aliou/pi-synthetic": minor
---

Support the plan-based weekly quota window. New Synthetic plans report
`planWeeklyLimit` (percent-based weekly credits) instead of
`weeklyTokenLimit`/`rollingFiveHourLimit`; the usage bar, quota warnings,
history, and refill projections now render and track it. The
`subscription` quota field is no longer read or stored.
