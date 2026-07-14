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
extensions/
  provider/
    index.ts                    # Provider extension entry point; ingests quota headers
    models.ts                   # Hardcoded provider model definitions
    models.test.ts              # Model config tests
    context-overflow.ts         # Provider-specific overflow normalization
  web-search/
    index.ts                    # Web search extension entry point
    tool.ts                     # Synthetic web search tool registration
  command-quotas/
    index.ts                    # Quotas command extension entry point
    command.ts                  # `synthetic:quotas` command for usage display
    components/
      quotas-display.ts         # TUI component for quotas display (all states)
  quota-warnings/
    index.ts                    # Quota warning notifications (event-driven)
  sub-bar-integration/
    index.ts                    # pi-sub-core usage bar (event-driven)
  usage-status/
    index.ts                    # Footer status bar showing live quota usage
src/
  client/
    index.ts                    # Synthetic client for quotas, web search, and model-list endpoints
  services/
    quota-store.ts              # In-memory quota store (header throttling, deduped refresh)
    quota-store.test.ts         # Tests
    quota-warnings.ts           # Pi-agnostic warning evaluator (severity, cooldown)
    quota-warnings.test.ts      # Tests
  config.ts                     # Feature settings and config migrations
  lib/
    env.ts                      # Auth helpers wrapping Pi AuthStorage
  types/
    quotas.ts                   # Quotas API types, event constants, parseQuotaHeader
  utils/
    quotas.ts                   # Quota formatting helpers
    quotas-severity.ts          # Quota severity calculations
    quotas-projection.ts        # Refill-aware quota projections
```

## Conventions

- Credentials come from Pi's provider auth resolution: `~/.pi/agent/auth.json` (recommended), `SYNTHETIC_API_KEY` environment variable, or the `apiKey: "$SYNTHETIC_API_KEY"` configured on the provider
- Provider uses OpenAI-compatible API at `https://api.synthetic.new/openai/v1`
- Non-provider Synthetic endpoints (`/v2/quotas`, `/v2/search`, `/openai/v1/models`) go through `src/client/index.ts`
- Models are fetched dynamically from `https://api.synthetic.new/openai/v1/models` via Pi 0.80.8's `ProviderConfig.refreshModels` and cached in `context.store` with a 4-hour TTL
- The hardcoded catalog in `extensions/provider/models.ts` is kept as an offline fallback and as the override source for model-specific compatibility settings (`thinkingLevelMap`, `compat`) that the API does not expose
- All user-facing model selection still uses the Pi provider name `synthetic`
- Web search tool and quotas command are always registered; they fail at call time if credentials/subscription are missing unless an unauthenticated utility API proxy is configured
- Error messages guide users to add credentials to `~/.pi/agent/auth.json`, set `SYNTHETIC_API_KEY`, or configure an unauthenticated utility API proxy when relevant
- Quota data flows event-driven: provider ingests `x-synthetic-quotas` header from `after_provider_response` into `QuotaStore`, which broadcasts via `synthetic:quotas:updated`; consumers (usage-status, quota-warnings, sub-bar-integration) listen and request refreshes via `synthetic:quotas:request` — no polling

## Model Configuration

`SYNTHETIC_MODELS` in `extensions/provider/models.ts` is the static fallback catalog. It is also used to apply overrides (`thinkingLevelMap`, `compat`) to models discovered from the Synthetic API in `buildSyntheticProviderModelsFromApi`.

### Model entry

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
  thinkingLevelMap?: { off?: "none" | null; minimal?: null; low?: null; medium?: "medium" | null; high?: null; xhigh?: null; max?: "max" | null; ... },
  compat?: {        // Optional provider-specific compatibility flags
    supportsDeveloperRole?: boolean,
    supportsReasoningEffort?: boolean,
    maxTokensField?: "max_completion_tokens" | "max_tokens",
    requiresToolResultName?: boolean,
    requiresMistralToolIds?: boolean
  }
}
```

Get pricing, input/output modalities, context length, and max output length from `https://api.synthetic.new/openai/v1/models`.
Get `maxTokens` from `https://models.dev/api.json` (synthetic provider) when the API omits it.

## Adding Models

### Adding a model

Append to `SYNTHETIC_MODELS` following the model entry shape above.

- Set `id` and `name` from the Synthetic API
- Set `reasoning` based on whether `supported_features` includes `"reasoning"`
- Set `input` from `input_modalities` (`"text"` / `"image"`)
- Convert per-token API prices to per-million rates for `cost`
- Set `contextWindow` from `context_length` and `maxTokens` from `max_output_length`
- Add `thinkingLevelMap` and `compat` overrides only when the API does not expose enough information for Pi to use the model correctly

The dynamic refresh will discover the new model automatically on the next refresh; the static entry is only needed for offline fallback and for the overrides above.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model updates
- `minor`: new models, features
- `major`: breaking changes

## Key Features

1. **Provider**: OpenAI-compatible chat completions with dynamic Synthetic model discovery via `ProviderConfig.refreshModels` and a hardcoded fallback catalog
2. **Web Search Tool**: Zero-data-retention web search via `synthetic_web_search`; can use the utility API proxy
3. **Quotas Command**: Interactive TUI for viewing API usage limits; can use the utility API proxy
4. **Usage Status**: Footer status bar showing live quota percentages, colored by severity (event-driven)
5. **Sub Integration**: Real-time usage tracking when used with pi-sub-core (event-driven)
6. **Quota Warnings**: Notifications when quota usage approaches or exceeds thresholds
