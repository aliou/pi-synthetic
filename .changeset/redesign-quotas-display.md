---
"@aliou/pi-synthetic": patch
---

Redesign quotas command display to match pi-harness style

- Single unified view showing all quotas at once
- Progress bar with filled (█) and empty (░) characters
- Usage display format: `5/335 (2%)` showing actual used/limit and percentage
- Estimated usage percentage based on current pace (`est X%`)
- Pace indicator (ahead/behind)
- Actual datetime for reset time (e.g., "today 5:31 PM" or "Apr 3 12:32 PM")
- Responsive layout for narrower terminals
