---
"@aliou/pi-synthetic": patch
---

Remove dead `!ctx.hasUI` branch from the `/synthetic:quotas` command handler. Commands are always invoked from the TUI.
