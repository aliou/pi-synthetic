---
"@aliou/pi-synthetic": minor
---

Add `/synthetic:quotas` command to display API usage quotas

A new slash command that shows your Synthetic API subscription quotas in a rich terminal UI:

- Visual usage bar with color-coded severity (green/yellow/red based on usage)
- Aligned columns showing limit, used, and remaining requests
- ISO8601 renewal timestamp with relative time formatting (e.g., "in 5 hours")
- Closes on any key press

The command is only registered when `SYNTHETIC_API_KEY` environment variable is set.
