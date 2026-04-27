---
"@aliou/pi-synthetic": minor
---

Live quota updates from x-synthetic-quotas response header

Quota data is now extracted from the `x-synthetic-quotas` response header
on every Synthetic provider response via the new `after_provider_response`
event, eliminating the need for 60-second polling.

- Provider extension ingests `x-synthetic-quotas` from `after_provider_response`
- Quota data broadcast via `pi.events` (`synthetic:quotas:updated`) to all consumers
- `usage-status`: removed polling timer, reads from events
- `quota-warnings`: reacts to quota events instead of fetching
- `sub-bar-integration`: removed polling timer, reads from events
- `command-quotas`: unchanged (fetches directly, works for any model)
- Added `parseQuotaHeader` for case-insensitive header extraction
- Upgraded `@mariozechner/pi-coding-agent` to 0.67.68
