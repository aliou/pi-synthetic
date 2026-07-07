![banner](https://assets.aliou.me/github/aliou/pi-synthetic/banner.png)

# Pi Synthetic Extension

A Pi extension that adds [Synthetic](https://synthetic.new) as a model provider, giving you access to open-source models through Synthetic's OpenAI-compatible API.

## Installation

### Get API Key

Sign up at [synthetic.new](https://synthetic.new/?referral=NDWw1u3UDWiFyDR) to get an API key (referral link).

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
/model synthetic hf:moonshotai/Kimi-K2.5
```

### Model Hosting

All models are accessed through Synthetic's API. Some models are hosted by Synthetic directly (`provider: "synthetic"` in the model config); others are proxied by Synthetic to upstream backends such as Fireworks or Together.

Synthetic also provides permanent aliases (`syn:large:text`, `syn:small:text`, `syn:large:vision`, `syn:small:vision`) that route to the current best model for each category. These aliases are stable across model rotations — using an alias means no reconfiguration when models change. Alias models are always visible even when Proxied Models is disabled.

By default, new installs show only Synthetic-hosted models. You can enable proxied models in `/synthetic:settings` under **Models > Proxied Models**. Existing configurations keep proxied models enabled to preserve prior behavior.

The `provider` field in `extensions/provider/models.ts` is for maintenance only and is stripped before registering models with Pi, so users always select the `synthetic` provider.

### Web Search Tool

The extension registers `synthetic_web_search` — a zero-data-retention web search tool. The tool is always visible; it fails with a clear message if credentials are missing, the account lacks a subscription, or the configured utility proxy rejects the request.

### Reasoning Levels

For Synthetic models that support reasoning, Synthetic currently accepts only `low`, `medium`, and `high` reasoning effort values.

This extension clamps Pi reasoning levels to Synthetic's supported set:
- `minimal` -> `low`
- `low` -> `low`
- `medium` -> `medium`
- `high` -> `high`
- `xhigh` -> `high`

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

The extension automatically notifies you when you approach or exceed your Synthetic API quotas. Notifications fire on severity transitions only (no repeated alerts for the same level) and use correct terminology (regen/tick/resets) with precise time formatting.

- Escalation always notifies
- `high` and `critical` levels have no cooldown
- `warning` level has a 60-minute cooldown

## Disabling Features

Each feature (provider, web search, quotas command, sub bar integration, usage status, quota warnings) is a separate Pi extension. You can disable individual features using `pi config`:

```
pi config extensions.disabled add @aliou/pi-synthetic/quota-warnings
```

This prevents the quota-warnings extension from loading while keeping the rest of pi-synthetic active. Replace `quota-warnings` with `web-search`, `command-quotas`, `sub-bar-integration`, `usage-status`, or `provider` to disable other features.

The **Proxied Models** and **Utility API Proxy** settings are not loadable extension features. They are regular settings controlled through `/synthetic:settings`.

## Adding or Updating Models

Models are hardcoded in `extensions/provider/models.ts`. Entries are a union of concrete models and thin aliases (`syn:*` IDs).

### Adding a concrete model

1. Edit `extensions/provider/models.ts`
2. Append a concrete model following the `SyntheticModelConfig` interface
3. Set `provider` to the upstream backend Synthetic uses for that model, such as `synthetic`, `fireworks`, or `together`
4. Run `pnpm run typecheck` to verify

### Adding an alias model

1. Add a thin `{ id, name, aliasFor }` entry at the top of `SYNTHETIC_MODELS`
2. Set `id` and `name` from the Synthetic API
3. Set `aliasFor` to `"hf:" + hugging_face_id` from the Synthetic API
4. The resolved alias inherits all fields from the target at build time

When Synthetic changes which model an alias routes to, update only the `aliasFor` field.

## Development

### Setup

```bash
git clone https://github.com/aliou/pi-synthetic.git
cd pi-synthetic

# Install dependencies (sets up pre-commit hooks)
pnpm install && pnpm prepare
```

Pre-commit hooks run on every commit:
- TypeScript type checking
- Biome linting
- Biome formatting with auto-fix

### Commands

```bash
# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format

# Test
pnpm run test
```

### Test Locally

```bash
pi -e .
```

## Release

This repository uses [Changesets](https://github.com/changesets/changesets) for versioning.

**Note:** Automatic NPM publishing is currently disabled. To publish manually:

1. Create a changeset: `pnpm changeset`
2. Version packages: `pnpm version`
3. Publish (when ready): Uncomment the publish job in `.github/workflows/publish.yml`

## Requirements

- Pi coding agent v0.77.0+
- Synthetic API key (configured in `~/.pi/agent/auth.json` or via `SYNTHETIC_API_KEY`) for model provider calls and authenticated utility API calls

## Links

- [Synthetic](https://synthetic.new)
- [Synthetic Models](https://synthetic.new/models)
- [Synthetic API Docs](https://dev.synthetic.new/docs/api/overview)
- [Pi Documentation](https://buildwithpi.ai/)