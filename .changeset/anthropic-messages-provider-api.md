---
"@aliou/pi-synthetic": minor
---

Add Synthetic's Anthropic-compatible `/anthropic/v1/messages` surface as a second provider API. Pick it with `/synthetic:settings` under Provider > API (reload required). The Anthropic surface streams real thinking blocks, uses native `tool_use`/`tool_result`, and reports the full cache read/write token split; reasoning is binary there (on/off) and `GLM-5.3-Flash` cannot disable reasoning.
