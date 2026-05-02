# pi-synthetic

Pi extension providing models available through the Synthetic provider.

## Stack

- TypeScript (strict mode)
- pnpm 10.26.1
- Biome for linting/formatting
- Changesets for versioning
- Vitest for testing

## Scripts

```bash
pnpm typecheck    # Type check
pnpm lint         # Lint (runs on pre-commit)
pnpm format       # Format
pnpm test         # Run tests
pnpm changeset    # Create changeset for versioning
```

## Structure

```
src/
  extensions/
    provider/
      index.ts                  # Provider extension entry point
      models.ts                 # Hardcoded model definitions
      models.test.ts            # Model config tests
    web-search/
      index.ts                  # Web search extension entry point
      tool.ts                   # Synthetic web search tool registration
    command-quotas/
      index.ts                  # Quotas command extension entry point
      command.ts                # `synthetic:quotas` command for usage display
      components/
        quotas-display.ts       # TUI component for quotas display (all states)
    quota-warnings/
      index.ts                  # Quota warning extension entry point
      notifier.ts               # Severity-transition notification logic
    sub-bar-integration/
      index.ts                  # Integration with pi-sub-core for usage display
    usage-status/
      index.ts                  # Footer status bar showing live quota usage
  config.ts                     # Feature settings and config migrations
  lib/
    env.ts                      # Auth helpers wrapping Pi AuthStorage
  types/
    quotas.ts                   # Quotas API response types
  utils/
    quotas.ts                   # Quotas fetching and formatting utilities
    quotas-severity.ts          # Quota severity calculations
```

## Conventions

- Credentials come from Pi auth handling (`AuthStorage`): `~/.pi/agent/auth.json` (recommended) or `SYNTHETIC_API_KEY` environment variable
- Provider uses OpenAI-compatible API at `https://api.synthetic.new/openai/v1`
- Models are hardcoded in `src/extensions/provider/models.ts`
- The model `provider` field records the upstream backend Synthetic uses (`synthetic`, `fireworks`, `together`, etc.); `registerSyntheticProvider` strips it before registering models with Pi
- `buildSyntheticProviderModels` filters the model list based on the `proxiedModels` config setting: when disabled, only models whose `provider` is `"synthetic"` are exposed
- All user-facing model selection still uses the Pi provider name `synthetic`
- Web search tool and quotas command are always registered; they fail at call time if credentials/subscription are missing
- Error messages guide users to add credentials to `~/.pi/agent/auth.json` or set `SYNTHETIC_API_KEY`

## Model Configuration

Models are defined in `src/extensions/provider/models.ts` with the following structure:

```typescript
{
  id: "hf:vendor/model-name",
  name: "vendor/model-name",
  provider: "synthetic" | "fireworks" | "together" | string,
  reasoning: true/false,
  input: ["text"] or ["text", "image"],
  cost: {
    input: 0.55,      // $ per million tokens
    output: 2.19,
    cacheRead: 0.55,
    cacheWrite: 0
  },
  contextWindow: 202752,
  maxTokens: 65536,
  thinkingLevelMap?: { minimal?: null; low?: null; xhigh?: null; ... },
  compat?: {        // Optional provider-specific compatibility flags
    supportsDeveloperRole?: boolean,
    supportsReasoningEffort?: boolean,
    maxTokensField?: "max_completion_tokens" | "max_tokens",
    requiresToolResultName?: boolean,
    requiresMistralToolIds?: boolean
  }
}
```

Get pricing and upstream backend/provider from `https://api.synthetic.new/openai/v1/models`.
Get maxTokens from `https://models.dev/api.json` (synthetic provider).

## Adding Models

Edit `src/extensions/provider/models.ts` and append to `SYNTHETIC_MODELS` array.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model updates
- `minor`: new models, features
- `major`: breaking changes

## Key Features

1. **Provider**: OpenAI-compatible chat completions with hardcoded Synthetic model metadata; filters proxied models based on `proxiedModels` setting
2. **Web Search Tool**: Zero-data-retention web search via `synthetic_web_search`
3. **Quotas Command**: Interactive TUI for viewing API usage limits
4. **Usage Status**: Footer status bar showing live quota percentages, colored by severity
5. **Quota Warnings**: Notifications on quota severity transitions
6. **Sub Bar Integration**: Real-time usage tracking when used with pi-sub-core

