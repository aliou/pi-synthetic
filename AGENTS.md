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
  index.ts                      # Extension entry, registers provider, tools, hooks, commands
  providers/
    index.ts                    # Provider registration (OpenAI-compatible API)
    models.ts                   # Hardcoded model definitions
    models.test.ts              # Model config tests
  tools/
    search.ts                   # Synthetic web search tool registration
  hooks/
    search-tool-availability.ts # Dynamic tool availability based on subscription
    sub-integration.ts          # Integration with pi-sub-core for usage display
  commands/
    quotas.ts                   # `synthetic:quotas` command for usage display
  components/
    quotas-display.ts           # TUI component for quotas display
    quotas-error.ts             # TUI component for quotas error state
    quotas-loading.ts           # TUI component for quotas loading state
    tabbed-panel.ts             # Reusable TUI tabbed panel component
  types/
    quotas.ts                   # Quotas API response types
  utils/
    quotas.ts                   # Quotas fetching and formatting utilities
```

## Conventions

- API key comes from environment (`SYNTHETIC_API_KEY`)
- Provider uses OpenAI-compatible API at `https://api.synthetic.new/openai/v1`
- Models are hardcoded in `src/providers/models.ts`
- Web search tool requires active subscription (checked at runtime)
- Quotas command only registered when `SYNTHETIC_API_KEY` is present

## Model Configuration

Models are defined in `src/providers/models.ts` with the following structure:

```typescript
{
  id: "hf:vendor/model-name",
  name: "vendor/model-name",
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
  compat?: {        // Optional provider-specific compatibility flags
    supportsDeveloperRole?: boolean,
    supportsReasoningEffort?: boolean,
    maxTokensField?: "max_completion_tokens" | "max_tokens",
    requiresToolResultName?: boolean,
    requiresMistralToolIds?: boolean
  }
}
```

Get pricing from `https://api.synthetic.new/openai/v1/models`.
Get maxTokens from `https://models.dev/api.json` (synthetic provider).

## Adding Models

Edit `src/providers/models.ts` and append to `SYNTHETIC_MODELS` array.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model updates
- `minor`: new models, features
- `major`: breaking changes

## Key Features

1. **Provider**: OpenAI-compatible chat completions with 15+ open-source models
2. **Web Search Tool**: Zero-data-retention web search via `synthetic_web_search`
3. **Quotas Command**: Interactive TUI for viewing API usage limits
4. **Sub Integration**: Real-time usage tracking when used with pi-sub-core
