---
"@aliou/pi-synthetic": patch
---

Update Synthetic models: replace MiniMax-M2.5 with MiniMax-M3

- Remove `hf:MiniMaxAI/MiniMax-M2.5` (no longer exposed by Synthetic API)
- Add `hf:MiniMaxAI/MiniMax-M3` with updated specs:
  - contextWindow: 524288
  - maxTokens: 65536
  - cost: input $0.6, output $1.2 per 1M tokens
  - reasoning: binary on/off (cannot disable via `reasoning_effort` on Synthetic's OpenAI wrapper)
  - input: text + image (API-declared, runtime tests inconclusive due to Synthetic infra)
