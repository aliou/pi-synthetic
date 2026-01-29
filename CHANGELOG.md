# @aliou/pi-synthetic

## 0.2.0

### Minor Changes

- 58d21ca: Fix model configurations from Synthetic API

  - Update maxTokens for all Synthetic models using values from models.dev (synthetic provider)
  - Fix Kimi-K2-Instruct-0905 reasoning flag to false

## 0.1.0

### Minor Changes

- 4a32d18: Initial release with 19 open-source models

  - Add Synthetic provider with Anthropic-compatible API
  - Support for DeepSeek, Qwen, MiniMax, Kimi, Llama, GLM models
  - Vision and reasoning capabilities where available
  - Hardcoded model definitions with per-token pricing
