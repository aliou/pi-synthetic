# Pi Synthetic Extension

A Pi extension that adds [Synthetic](https://synthetic.new) as a model provider, giving you access to open-source models through an Anthropic-compatible API.

## Installation

### Get API Key

Sign up at [synthetic.new](https://synthetic.new/?referral=NDWw1u3UDWiFyDR) to get an API key (referral link).

### Set Environment Variable

```bash
export SYNTHETIC_API_KEY="your-api-key-here"
```

Add to shell profile for persistence:

```bash
echo 'export SYNTHETIC_API_KEY="your-api-key-here"' >> ~/.zshrc
```

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
- SYNTHETIC_API_KEY environment variable

## Links

- [Synthetic](https://synthetic.new)
- [Synthetic Models](https://synthetic.new/models)
- [Synthetic API Docs](https://dev.synthetic.new/docs/api/overview)
- [Pi Documentation](https://buildwithpi.ai/)
