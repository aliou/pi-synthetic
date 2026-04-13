---
"@aliou/pi-synthetic": patch
---

Refactor `fetchQuotas` to return structured `QuotasResult` with `QuotasErrorKind`, add `AbortSignal` support with 15s timeout, and add animated loading spinner to the quotas TUI command.
