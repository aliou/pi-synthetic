# Pi Synthetic Extension

A Pi extension that adds [Synthetic](https://synthetic.new) as a model provider, giving you access to open-source models through an OpenAI-compatible API.

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
pi -e ./src/index.ts
```

## Usage

Once installed, select `synthetic` as your provider and choose from available models:

```
/model synthetic hf:moonshotai/Kimi-K2.5
```

### Web Search Tool

The extension registers `synthetic_web_search` — a zero-data-retention web search tool. The tool is always visible; it fails with a clear message if credentials are missing or the account lacks a subscription.

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

## Adding or Updating Models

Models are hardcoded in `src/providers/models.ts`. To add or update models:

1. Edit `src/providers/models.ts`
2. Add the model configuration following the `SyntheticModelConfig` interface
3. Run `pnpm run typecheck` to verify

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
pi -e ./src/index.ts
```

## Release

This repository uses [Changesets](https://github.com/changesets/changesets) for versioning.

**Note:** Automatic NPM publishing is currently disabled. To publish manually:

1. Create a changeset: `pnpm changeset`
2. Version packages: `pnpm version`
3. Publish (when ready): Uncomment the publish job in `.github/workflows/publish.yml`

## Requirements

- Pi coding agent v0.50.0+
- Synthetic API key (configured in `~/.pi/agent/auth.json` or via `SYNTHETIC_API_KEY`)

## Links

- [Synthetic](https://synthetic.new)
- [Synthetic Models](https://synthetic.new/models)
- [Synthetic API Docs](https://dev.synthetic.new/docs/api/overview)
- [Pi Documentation](https://buildwithpi.ai/)
