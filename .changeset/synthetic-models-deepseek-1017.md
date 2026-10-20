---
"@aliou/pi-synthetic": patch
---

Sync the static model catalog with the Synthetic API: add `hf:deepseek-ai/DeepSeek-V4.1-Flash-1017`, a pinned 10/17 snapshot of DeepSeek-V4.1-Flash with vision support, 524K context, and DeepSeek-tier pricing ($0.6/M input, $1.2/M output, $0.03/M cache reads). Runtime-verified: `reasoning_effort: "none"` disables reasoning (exposed as the `off` level) and advertised efforts none/low/high/xhigh/max map by identity, identical to the floating model.
