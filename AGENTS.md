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

- Credentials come from Pi auth handling (`AuthStorage`): `~/.pi/agent/auth.json` (recommended) or `SYNTHETIC_API_KEY` environment variable
- Provider uses OpenAI-compatible API at `https://api.synthetic.new/openai/v1`
- Non-provider Synthetic endpoints (`/v2/quotas`, `/v2/search`, `/openai/v1/models`) go through `src/client/index.ts`
- Models are hardcoded in `extensions/provider/models.ts`
- The model `provider` field records the upstream backend Synthetic uses (`synthetic`, `fireworks`, `together`, etc.); `registerSyntheticProvider` strips it before registering models with Pi
- `buildSyntheticProviderModels` resolves aliases from their targets, then filters the model list based on the `proxiedModels` config setting: when disabled, only models whose `provider` is `"synthetic"` are exposed. Aliases always resolve with `provider: "synthetic"`, so they remain visible even when proxied models are hidden
- Alias entries (`syn:*` IDs) are thin references. The `aliasFor` value maps to the `hugging_face_id` field from the Synthetic API (prefixed with `hf:`). All other fields are inherited from the target at build time
- All user-facing model selection still uses the Pi provider name `synthetic`
- Web search tool and quotas command are always registered; they fail at call time if credentials/subscription are missing unless an unauthenticated utility API proxy is configured
- Error messages guide users to add credentials to `~/.pi/agent/auth.json`, set `SYNTHETIC_API_KEY`, or configure an unauthenticated utility API proxy when relevant
- Quota data flows event-driven: provider ingests `x-synthetic-quotas` header from `after_provider_response` into `QuotaStore`, which broadcasts via `synthetic:quotas:updated`; consumers (usage-status, quota-warnings, sub-bar-integration) listen and request refreshes via `synthetic:quotas:request` — no polling

## Model Configuration

Entries in `extensions/provider/models.ts` are a union of concrete models and thin aliases.

### Alias entry (at top of array)

```typescript
{
  id: "syn:large:text",
  name: "syn:large:text",
  aliasFor: "hf:zai-org/GLM-5.1",  // resolves to concrete model at build time
}
```

Alias entries have no `provider`, `cost`, `contextWindow`, `compat`, or `thinkingLevelMap` — these are inherited from the target at build time in `buildSyntheticProviderModels`. Aliases always resolve with `provider: "synthetic"`, so they are always visible regardless of the `proxiedModels` setting.

### Concrete entry

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
  thinkingLevelMap?: { off?: "none" | null; minimal?: null; low?: null; medium?: "medium" | null; high?: null; xhigh?: null; ... },
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

### Adding a concrete model

Append to `SYNTHETIC_MODELS` following the concrete entry shape above.

### Adding an alias model

Add a thin `{ id, name, aliasFor }` entry **at the top of the array**.

- Set `id` and `name` from the Synthetic API
- Set `aliasFor` to `"hf:" + hugging_face_id` from the Synthetic API
- The resolved alias inherits all fields from the target at build time
- When Synthetic changes which model an alias routes to, update only the `aliasFor` field

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model updates
- `minor`: new models, features
- `major`: breaking changes

## Key Features

1. **Provider**: OpenAI-compatible chat completions with hardcoded Synthetic model metadata; filters proxied models based on `proxiedModels` setting
2. **Web Search Tool**: Zero-data-retention web search via `synthetic_web_search`; can use the utility API proxy
3. **Quotas Command**: Interactive TUI for viewing API usage limits; can use the utility API proxy
4. **Usage Status**: Footer status bar showing live quota percentages, colored by severity (event-driven)
5. **Sub Integration**: Real-time usage tracking when used with pi-sub-core (event-driven)
6. **Quota Warnings**: Notifications when quota usage approaches or exceeds thresholds
