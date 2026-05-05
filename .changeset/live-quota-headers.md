---
"@aliou/pi-synthetic": minor
---

Use event-driven Synthetic quota updates without polling.

Quota data is now extracted from the `x-synthetic-quotas` response header on Synthetic provider responses and stored centrally. Usage status and quota warnings read the latest quota snapshot through short-lived callbacks from fresh Pi lifecycle contexts, avoiding stale `ExtensionContext` crashes after reloads or session switches.
