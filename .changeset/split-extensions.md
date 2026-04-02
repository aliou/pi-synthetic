---
"@aliou/pi-synthetic": patch
---

Enable per-feature extension toggling via pi config

Split the monolithic extension into three independent entry points:

- **Provider** - Synthetic model provider (always active when API key set)
- **Web Search** - Zero-data-retention web search tool
- **Quotas Command** - API usage quotas display command

Users can now enable/disable features individually via `pi config` instead of all-or-nothing.
