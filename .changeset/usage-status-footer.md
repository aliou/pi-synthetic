---
"@aliou/pi-synthetic": minor
---

feat(usage-status): footer status bar showing live quota usage

Add usage-status extension that displays live quota percentages
(weekly credits, rolling 5h, etc.) in the footer status bar when a
Synthetic model is active. Colors follow the same severity
assessment as quota-warnings for consistency. Auto-refreshes every
60s and after each turn. Hides for non-Synthetic models.
