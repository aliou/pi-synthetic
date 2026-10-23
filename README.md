![banner](https://assets.aliou.me/github/aliou/pi-synthetic/banner.png)

# Pi Synthetic Extension

A Pi extension that adds [Synthetic](https://gnldxt.link/ref-syn) as a model provider, giving you access to open-source models through Synthetic's OpenAI-compatible API.

## Installation

### Get API Key

Sign up [here](https://gnldxt.link/ref-syn) to get an API key (referral link).

### Configure Credentials

The extension uses Pi's credential storage. Add your API key to `~/.pi/agent/auth.json` (recommended):

```json
{
  "synthetic": { "type": "api_key", "key": "your-api-key-here" }
}
```

Or set environment variable:

```bash
export SYNTHETIC_API_KEY="your-api-key-here"
```

Credentials are resolved in this order:
1. CLI `--api-key` flag
2. `auth.json` entry for `synthetic`
3. Environment variable `SYNTHETIC_API_KEY`

### Install Extension

```bash
# From npm
pi install npm:@aliou/pi-synthetic

# From git
pi install git:github.com/aliou/pi-synthetic

# Local development
pi -e .
```

## Usage

Once installed, select `synthetic` as your provider and choose from available models:

```
/model synthetic hf:moonshotai/Kimi-K3
```

### Models

Models come from Synthetic's models API and are cached for four hours. A built-in list covers offline starts and carries per-model reasoning and compatibility overrides the API does not expose.

Synthetic's category IDs (`syn:large:text`, `syn:small:text`, `syn:large:vision`, `syn:small:vision`) always route to the current best model for that category, so they survive model rotations without reconfiguration.

### Web Search Tool

The extension registers `synthetic_web_search` — a zero-data-retention web search tool. At session start, it checks the Synthetic quotas API in the background even when another provider is selected. The tool is available only after that check confirms a Synthetic subscription; it remains hidden for pay-as-you-go accounts, missing credentials, and quota API failures.

### Prompt Cache

Synthetic caches prompt prefixes per inference node. Pi reads cache hits from the `prompt_tokens_details.cached_tokens` field and prices them at the cache-read rate Synthetic's API reports. Reuse within a session is the reliable case; cross-session reuse is not guaranteed.

### Reasoning Levels

Accepted reasoning efforts differ per model. Built-in per-model mappings limit Pi's level picker to what each known model accepts. Some models cannot turn reasoning off; some accept `max`.

### Provider API

Synthetic serves every chat model twice: on an OpenAI-compatible `POST /openai/v1` endpoint and on an Anthropic-compatible `POST /anthropic/v1/messages` endpoint. The full catalog (`hf:` models and `syn:` aliases alike) is valid on both surfaces; quotas, pricing, and the web search tool are surface-agnostic.

Pick the surface with `/synthetic:settings` under **Provider > API** (default `openai-completions`). Changes apply after `/reload`.

The Anthropic surface streams real thinking blocks, uses native `tool_use`/`tool_result`, and reports cache reads and writes directly. Its reasoning control is on or off only: effort levels are not graded, and `syn:large:text` and `hf:zai-org/GLM-5.3-Flash` cannot turn reasoning off. The OpenAI surface keeps graded effort where the model supports it.

### Quotas Command

Check your API usage:

```
/synthetic:quotas
```

### Utility API Proxy

Web search and quotas can use a proxy instead of `https://api.synthetic.new`. Configure it with `/synthetic:settings` under **Connection > Utility API Proxy**. The proxy is only used for `/v2/search` and `/v2/quotas`; model provider calls still use Synthetic's OpenAI-compatible endpoint directly.

If the proxy requires auth, pi-synthetic still requires a Synthetic API key and sends `Authorization: Bearer ...`. If the proxy does not require auth, disable **Requires auth** and these utility calls skip API key checks and omit `Authorization`.

### Usage Status

When a Synthetic model is active, the footer status bar shows live quota usage (e.g. `week:82% (↺in 3d) 5h:95%`). Colors follow the same severity assessment as quota warnings: green by default, yellow/red only when projected usage is at risk. The status auto-refreshes every 60 seconds and after each turn.

### Quota Warnings

The extension automatically notifies you when you approach or exceed your Synthetic API quotas. Notifications fire on severity transitions and escalations, not as repeated reminders for the same level. Recovered quotas can notify again if they later become risky.

Weekly credits and five-hour request windows are projected from recent usage, so a short burst does not trigger a weekly warning. Without enough history, warnings use current usage instead. For projections, the extension keeps up to 14 days (5 MiB) of quota history under `$XDG_STATE_HOME/pi-synthetic/quota-history` or Pi's agent state directory. Nothing is stored while quota warnings are disabled.

## Disabling Features

Each feature (provider, web search, quotas command, usage status, quota warnings) is a separate Pi extension. Disable individual features either through the `pi config` TUI or by editing `~/.pi/agent/settings.json`.

Run `pi config` to open the resource selector and unselect the extension you want to disable. Press Tab to switch between global and project-local scope.

To disable features directly in `~/.pi/agent/settings.json`, list the extensions you want with `+` (enable) and `-` (disable) prefixes on paths relative to the package root. For example, to disable usage-status and quota-warnings while keeping the rest active:

```json
{
  "packages": [
    {
      "source": "npm:@aliou/pi-synthetic",
      "extensions": [
        "+extensions/command-quotas/index.ts",
        "-extensions/usage-status/index.ts",
        "-extensions/quota-warnings/index.ts",
        "+extensions/web-search/index.ts",
        "+extensions/provider/index.ts"
      ]
    }
  ]
}
```

The extension paths map to the files under `extensions/` in this repo: `provider`, `web-search`, `command-quotas`, `usage-status`, and `quota-warnings`.

The **Utility API Proxy** setting is not a loadable extension feature. It is a regular setting controlled through `/synthetic:settings`.

## Development

```bash
git clone https://github.com/aliou/pi-synthetic.git
cd pi-synthetic
nix develop       # Node.js, pnpm 11, and pre-commit hooks
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pi -e .            # run Pi with the local checkout
```

The Nix dev shell installs pre-commit hooks for Biome, frozen-lockfile checks, and typechecking. Built-in model entries live in `extensions/provider/models.ts`; `AGENTS.md` explains how they combine with the API catalog.

Releases use [Changesets](https://github.com/changesets/changesets). After CI passes on `main`, the publish workflow opens a release PR; merging it stages the package on npm for manual promotion.

## Requirements

- Pi coding agent v1.0.0+ (required for `ProviderConfig.refreshModels` dynamic model discovery)
- Synthetic API key (configured in `~/.pi/agent/auth.json` or via `SYNTHETIC_API_KEY`) for model provider calls and authenticated utility API calls

## Links

- [Synthetic](https://gnldxt.link/ref-syn)
- [Synthetic Models](https://gnldxt.link/ref-syn)
- [Synthetic API Docs](https://dev.synthetic.new/docs/api/overview)
- [Pi Documentation](https://buildwithpi.ai/)
