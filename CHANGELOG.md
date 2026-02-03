# @aliou/pi-synthetic

## 0.4.2

### Patch Changes

- d9af905: Add demo video URL for the Pi package browser.

## 0.4.1

### Patch Changes

- aba3bb8: fix: use correct /v2/quotas endpoint for subscription access check

## 0.4.0

### Minor Changes

- 5cca252: Add `/synthetic:quotas` command to display API usage quotas

  A new slash command that shows your Synthetic API subscription quotas in a rich terminal UI:

  - Visual usage bar with color-coded severity (green/yellow/red based on usage)
  - Aligned columns showing limit, used, and remaining requests
  - ISO8601 renewal timestamp with relative time formatting (e.g., "in 5 hours")
  - Closes on any key press

  The command is only registered when `SYNTHETIC_API_KEY` environment variable is set.

- a8cacfb: Add Synthetic web search tool

  New tool `synthetic_web_search` allows agents to search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates.

  **Note:** Search is a subscription-only feature. The tool will only be registered if the `SYNTHETIC_API_KEY` belongs to an active subscription (verified via the usage endpoint).

## 0.3.0

### Minor Changes

- 5f67daf: Switch from Anthropic to OpenAI API endpoints

  - Change API endpoint from `/anthropic` to `/openai/v1`
  - Update from `anthropic-messages` to `openai-completions` API
  - Add compatibility flags for proper role handling (`supportsDeveloperRole: false`)
  - Use standard `max_tokens` field instead of `max_completion_tokens`

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
