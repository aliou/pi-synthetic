---
"@aliou/pi-synthetic": patch
---

Hide the `low` thinking level on GLM-5.3-Flash. It degenerates into a repetition loop that burns the full token budget without producing a final answer (same defect as GLM-5.3's `low`). The model now exposes only `high` and `max`, matching GLM-5.3.
