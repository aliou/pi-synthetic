---
"@aliou/pi-synthetic": patch
---

### Qwen3.8-27B: expose xhigh thinking level

Upstream metadata (`GET /v1/models`) declares `reasoning_parameters.efforts: ["low", "medium", "xhigh"]` for `hf:Qwen/Qwen3.8-27B`. Live probes confirm `xhigh` produces the deepest reasoning, `low` returns no reasoning content even on hard prompts, and `high`/`max` are accepted but not model-native. `thinkingLevelMap` now exposes off / medium / xhigh.
