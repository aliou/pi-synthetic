# @aliou/pi-synthetic

## 0.10.0

### Minor Changes

- 9d40b3f: Add support for new Synthetic API quota format with weekly token credits and rolling 5-hour limits

  - Display weekly token quota with credits-based tracking ($X.XX/$Y.YY format)
  - Show rolling 5-hour request quota with tick-based regeneration
  - Use simple indicator bar for new quota types (marker instead of fill)
  - Display regeneration info: "+$X.XX in Xh" for credits, "+X in Xm" for requests
  - Maintain backward compatibility with legacy subscription format
  - Fix division-by-zero bugs and fragile currency parsing
  - Harden edge cases with safePercent() and parseCurrency() helpers

## 0.9.0

### Minor Changes

- a85b467: Switch to Pi AuthStorage for credential handling

  - Replace direct env var reads with AuthStorage wrapper
  - Remove preflight subscription gating - tools/commands always register
  - Credentials resolved at call time, not module load
  - Resolve key inside each poll tick for sub-integration
  - Clear error messages guide users to ~/.pi/agent/auth.json
  - Remove web-search/hooks.ts (no longer needed)

## 0.8.6

### Patch Changes

- a60d071: Update Synthetic model metadata for GLM-5 pricing.

## 0.8.5

### Patch Changes

- 64cf4ec: Redesign quotas command display to match pi-harness style

  - Single unified view showing all quotas at once
  - Progress bar with filled (█) and empty (░) characters
  - Usage display format: `5/335 (2%)` showing actual used/limit and percentage
  - Estimated usage percentage based on current pace (`est X%`)
  - Pace indicator (ahead/behind)
  - Actual datetime for reset time (e.g., "today 5:31 PM" or "Apr 3 12:32 PM")
  - Responsive layout for narrower terminals

- b1986fb: Enable per-feature extension toggling via pi config

  Split the monolithic extension into three independent entry points:

  - **Provider** - Synthetic model provider (always active when API key set)
  - **Web Search** - Zero-data-retention web search tool
  - **Quotas Command** - API usage quotas display command

  Users can now enable/disable features individually via `pi config` instead of all-or-nothing.

- a7aa27f: Change sub bar label from "Free" to "Tools" for free tool calls

## 0.8.4

### Patch Changes

- 6c5b9e4: add hf:zai-org/GLM-5 to synthetic model registry

## 0.8.3

### Patch Changes

- 82b82a7: sync GLM-4.7 and Kimi-K2.5 pricing with live Synthetic API to fix model validation CI

## 0.8.2

### Patch Changes

- 0c5dbd2: update Pi deps to 0.61.0, migrate keybinding hints, and refresh model pricing

## 0.8.1

### Patch Changes

- e2ff8ec: Fix dependency group for utils-ui

## 0.8.0

### Minor Changes

- 606e829: Redesign web search tool UI to match read_url pattern

  - Use ToolCallHeader and ToolFooter from @aliou/pi-utils-ui for consistent styling
  - Collapsed view shows result count with first result title and expand hint
  - Expanded view shows each result with title, URL, published date, and a 5-line blockquote snippet rendered as Markdown
  - Error handling uses throw instead of returning error details, matching the pi framework convention
  - Errors now display the actual error message instead of misleading "no results"
  - Footer shows result count only (no redundant "failed: no")

## 0.7.0

### Minor Changes

- 4547220: Add NVIDIA Nemotron-3-Super-120B-A12B-NVFP4 model

### Patch Changes

- 018f25d: Fix Qwen3.5-397B-A17B output pricing (3 -> 3.6 per million tokens)

## 0.6.3

### Patch Changes

- 7a02939: Clamp Pi reasoning levels for Synthetic reasoning-capable models so unsupported `minimal` maps to `low` and unsupported `xhigh` maps to `high`.

## 0.6.2

### Patch Changes

- 3570b3c: Use per-model compat overrides for Synthetic models and switch MiniMax M2.5 to `max_completion_tokens` to avoid request-shaping issues with `max_tokens`.

## 0.6.1

### Patch Changes

- 6c0148f: Sync hardcoded Synthetic model definitions with the live API.

  - Update pricing for `hf:meta-llama/Llama-3.3-70B-Instruct`
  - Remove `hf:deepseek-ai/DeepSeek-V3-0324` (no longer in API)
  - Add `hf:zai-org/GLM-4.7-Flash`

## 0.6.0

### Minor Changes

- 628616b: Update model configurations and add automated API validation tests

  - Fixed `GLM-4.7` maxTokens from 64000 to 65536
  - Fixed `MiniMax-M2.5` input modalities from ["text","image"] to ["text"]
  - Updated pricing for `MiniMax-M2.1`, `Kimi-K2.5`, and `Qwen3-Coder-480B-A35B`
  - Added `maxTokens` and `reasoning` field validation test
  - Added vitest for testing with `pnpm test` and `pnpm test:watch` scripts
  - Added test step to pre-commit hook

### Patch Changes

- 3f41a60: Add identification headers to API requests

  - Added `Referer: https://pi.dev` header
  - Added `X-Title: npm:@aliou/pi-synthetic` header

## 0.5.1

### Patch Changes

- 48fde38: Add MiniMax-M2.5 model, fix Qwen3.5 input modalities and reasoning

## 0.5.0

### Minor Changes

- 9faaa42: Add pi-sub integration via sub-core events
- eee2c68: Redesign quotas display with tabbed interface and pace tracking
- 562cbf7: Add Qwen3.5-397B-A17B model to the available models list

### Patch Changes

- b29fe7c: Return JSON in RPC mode instead of plain text

## 0.4.7

### Patch Changes

- 98d1a0f: Move `@mariozechner/pi-tui` to peer dependencies to avoid bundling the SDK alongside the extension. Fix `prepare` script to only run husky from a git repository.
- f1d24e8: Remove dead `!ctx.hasUI` branch from the `/synthetic:quotas` command handler. Commands are always invoked from the TUI.
- 8c54ec4: Remove debug notifications emitted during `session_start` and `before_agent_start` in the web search availability hook.

## 0.4.6

### Patch Changes

- 6180572: mark pi SDK peer deps as optional to prevent koffi OOM in Gondolin VMs
- fe8094f: register synthetic web search tool at init time and move availability checks to hooks

## 0.4.5

### Patch Changes

- 7489bc0: update model list: add nvidia/Kimi-K2.5-NVFP4, remove 6 discontinued models

## 0.4.4

### Patch Changes

- 86a3145: Fix quotas command showing duplicate notification in TUI mode
- f94cc6b: fix: register search tool at init time so it's available when pi collects tools

## 0.4.3

### Patch Changes

- 7dc1d80: Defer subscription check to session_start for non-blocking extension init.

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
