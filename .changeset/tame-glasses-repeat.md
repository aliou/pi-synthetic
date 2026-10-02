---
"@aliou/pi-synthetic": patch
---

Add GLM-5.3 to the model catalog. Reasoning streams as `reasoning_content` and replays without extra kwargs. The advertised `low` effort degenerates into a repetition loop and `none` does not disable reasoning, so only `high` and `max` thinking levels are exposed.
