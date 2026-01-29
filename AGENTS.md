# pi-synthetic

Public Pi extension providing open-source language models via Synthetic's API. People could be using this, so consider backwards compatibility when making changes.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Stack

- TypeScript (strict mode)
- pnpm 10.26.1
- Biome for linting/formatting
- Changesets for versioning

## Scripts

```bash
pnpm typecheck    # Type check
pnpm lint         # Lint (runs on pre-commit)
pnpm format       # Format
pnpm changeset    # Create changeset for versioning
```

## Structure

```
src/
  index.ts           # Extension entry, registers provider
  providers/
    index.ts         # Provider registration
    models.ts        # Hardcoded model definitions
```

## Conventions

- API key comes from environment (`SYNTHETIC_API_KEY`)
- Uses OpenAI-compatible API at `https://api.synthetic.new/openai/v1`
- Models are hardcoded in `src/providers/models.ts`
- Update model list when Synthetic adds new models

## Adding Models

Edit `src/providers/models.ts`:

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
  maxTokens: 65536
}
```

Get pricing from `https://api.synthetic.new/openai/v1/models`.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model updates
- `minor`: new models, features
- `major`: breaking changes
