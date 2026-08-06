---
"@aliou/pi-synthetic": patch
---

Add Pi coding-agent 0.84 compatibility for the provider model refresh: catalog reads and persistence now go through a runtime shape-detection shim (`extensions/provider/refresh-store-compat.ts`) that uses the 0.84 `context.stored` snapshot and `context.publish({ persist })` transaction when available, and falls back to the legacy `context.store` read/write on older hosts. The 4-hour cache TTL, best-effort fallback on transient fetch/build errors, and abort propagation are unchanged. The `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui` peer ranges drop their <0.81.0 caps and now support both pre-0.84 and 0.84+ hosts.
