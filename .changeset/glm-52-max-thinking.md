---
"@aliou/pi-synthetic": minor
---

Expose Pi's native `max` thinking level on `hf:zai-org/GLM-5.2` (and its `syn:large:text` alias). GLM-5.2 now maps `max -> "max"` (literal, accepted by Synthetic's OpenAI shim) instead of the previous `xhigh -> "medium"` fallthrough. `xhigh` is hidden; the two effective tiers remain off / high / max. Bump pi peer/dev deps to 0.80.7.
