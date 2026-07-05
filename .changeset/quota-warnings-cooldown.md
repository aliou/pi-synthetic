---
"@aliou/pi-synthetic": patch
---

Fix quota warnings over-firing. `high` and `critical` severity windows now respect the same 60-minute cooldown as `warning` (escalation still notifies immediately). Stop clearing alert state on `session_start` and `model_select` right before evaluating, which previously bypassed the cooldown on every switch. Only reset alert state on genuine identity transitions (`session_before_switch`, `session_shutdown`) or a real `quotaWarnings` config toggle.
