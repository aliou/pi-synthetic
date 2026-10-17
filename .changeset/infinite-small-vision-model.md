---
"@aliou/pi-synthetic": patch
---

Sync the static model catalog with the Synthetic API: add `infinite:small:vision` (vision-capable tier routing to DeepSeek-V4.1-Flash with 524K context and zero per-token pricing; reasoning efforts none/low/high/xhigh/max map by identity), and update `syn:small:vision` for its new DeepSeek-V4.1-Flash backend (context doubled to 524K, pricing moved to the DeepSeek tier, reasoning efforts remapped by identity).
