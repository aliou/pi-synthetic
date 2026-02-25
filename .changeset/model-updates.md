---
"@aliou/pi-synthetic": minor
---

Update model configurations and add automated API validation tests

- Fixed `GLM-4.7` maxTokens from 64000 to 65536
- Fixed `MiniMax-M2.5` input modalities from ["text","image"] to ["text"]
- Updated pricing for `MiniMax-M2.1`, `Kimi-K2.5`, and `Qwen3-Coder-480B-A35B`
- Added `maxTokens` and `reasoning` field validation test
- Added vitest for testing with `pnpm test` and `pnpm test:watch` scripts
- Added test step to pre-commit hook
