---
name: update-synthetic-model
description: Update model metadata for the pi-synthetic extension. Use when adding or refreshing entries in src/extensions/provider/models.ts. Start by running the model tests, inspect current hardcoded definitions, fetch live data from Synthetic and models.dev, then update the file proactively without asking the user which model to change.
---

# Update Synthetic model

Update `src/extensions/provider/models.ts` from live data, not guesswork.

## Default behavior

Take initiative.

Do not start by asking which model to update. First detect drift, then update whatever needs updating:

1. Run the model test to find mismatches and new models.
2. Read the current hardcoded definitions in `src/extensions/provider/models.ts`.
3. Fetch live model data from:
   - `https://api.synthetic.new/openai/v1/models`
   - `https://models.dev/api.json`
4. Reconcile the differences.
5. Edit `src/extensions/provider/models.ts`.
6. Re-run the relevant tests.

Only ask the user if there is a real blocker, such as missing credentials for runtime validation or conflicting evidence you cannot resolve.

## Sources of truth

Use these in order:

1. Synthetic models endpoint: `https://api.synthetic.new/openai/v1/models`
2. Existing test failures from `src/extensions/provider/models.test.ts`
3. `https://models.dev/api.json` under `.synthetic.models`
4. Synthetic runtime behavior via direct `chat/completions` calls when needed
5. If a model is missing under Synthetic on models.dev, inspect the same model under other providers on models.dev only as supporting evidence

## Required workflow

### 1) Start with tests

Run the targeted model test first so you know what changed:

```bash
pnpm test -- src/extensions/provider/models.test.ts
```

Use the failures to identify:

- stale fields on existing models
- models that exist in code but no longer exist upstream
- new Synthetic models missing from `SYNTHETIC_MODELS`

If the test passes, still check for drift manually by reading the current file and comparing with fresh endpoint data. Do not assume no work is needed just because tests pass.

### 2) Inspect current definitions

Read:

- `src/extensions/provider/models.ts`
- `src/extensions/provider/models.test.ts`

Use the current file shape and comments as the formatting baseline.

### 3) Fetch Synthetic endpoint data

Query the full model list, then inspect affected models.

Example:

```bash
curl -s https://api.synthetic.new/openai/v1/models \
  | jq '.data[] | select(.id=="hf:zai-org/GLM-4.7-Flash")'
```

Useful narrow query:

```bash
curl -s https://api.synthetic.new/openai/v1/models \
  | jq '.data[] | select(.id==$id) | {
      id,
      name,
      input_modalities,
      output_modalities,
      context_length,
      max_output_length,
      pricing,
      supported_features
    }' --arg id 'hf:zai-org/GLM-4.7-Flash'
```

### 4) Fetch models.dev data

Check the Synthetic provider entry first:

```bash
curl -sL -A 'Mozilla/5.0' https://models.dev/api.json \
  | jq '.synthetic.models["hf:zai-org/GLM-4.7"]'
```

If missing under Synthetic, inspect other providers:

```bash
curl -sL -A 'Mozilla/5.0' https://models.dev/api.json \
  | jq 'to_entries
    | map({provider: .key, model: .value.models["hf:zai-org/GLM-4.7-Flash"]})
    | map(select(.model != null))
    | map({provider, reasoning: .model.reasoning, input: .model.modalities.input, maxTokens: .model.max_output_tokens})'
```

## Field mapping

Copy these directly from the Synthetic endpoint when available:

- `id`
- `name`
- `context_length` -> `contextWindow`
- `max_output_length` -> `maxTokens` when present and trustworthy
- `pricing.prompt` -> `cost.input` per 1M
- `pricing.completion` -> `cost.output` per 1M
- `pricing.input_cache_reads` -> `cost.cacheRead` per 1M
- `pricing.input_cache_writes` -> `cost.cacheWrite` per 1M
- `input_modalities` -> `input`

Cross-check these from models.dev:

- `reasoning`
- `modalities.input`
- `max_output_tokens` / output token limit when Synthetic metadata is absent or suspicious

## Decision rules

- Start from test failures, but update all clearly stale entries you find in the same pass.
- Add new models when the Synthetic endpoint exposes them and they fit the existing provider scope.
- Remove models only when they are truly gone from Synthetic, not because of a temporary fetch issue.
- Set `input` from the Synthetic endpoint first.
- Set pricing from the Synthetic endpoint.
- Set `contextWindow` from the Synthetic endpoint.
- Set `maxTokens` from Synthetic when exposed; otherwise use models.dev Synthetic data.
- Set `reasoning` from:
  1. confirmed Synthetic runtime behavior
  2. else Synthetic endpoint `supported_features`
  3. else models.dev Synthetic entry
  4. else other providers on models.dev as weak evidence only
- Keep existing `compat` unless live behavior or current repo conventions show it should change.
- Do not ask the user which models to update unless there is a true ambiguity you cannot resolve.

## Required runtime checks

Do not rely only on metadata for `reasoning` or multimodal support when the evidence is mixed or when you are adding a new model with unclear behavior.

Use the environment variable `SYNTHETIC_API_KEY`. Never print it.

### Reasoning check

```bash
curl -sS https://api.synthetic.new/openai/v1/chat/completions \
  -H "Authorization: Bearer $SYNTHETIC_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "model": "hf:zai-org/GLM-4.7-Flash",
  "messages": [{"role": "user", "content": "Reply with ok"}],
  "reasoning_effort": "low",
  "max_completion_tokens": 64
}
JSON
```

Treat `reasoning` as supported if the request succeeds and clearly accepts reasoning mode.

### Image input check

```bash
curl -sS https://api.synthetic.new/openai/v1/chat/completions \
  -H "Authorization: Bearer $SYNTHETIC_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "model": "hf:zai-org/GLM-4.7-Flash",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image? Reply in 3 words max."},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR0i8AAAAASUVORK5CYII="}}
      ]
    }
  ],
  "max_completion_tokens": 32
}
JSON
```

If Synthetic rejects image input, keep `input: ["text"]`.

## Compat rules

`src/extensions/provider/models.ts` supports an optional `compat` object per model.

Only add or change `compat` when live behavior, provider quirks, or current repo conventions require it.

Useful fields in this repo:

- `supportsDeveloperRole`
- `supportsReasoningEffort`
- `reasoningEffortMap`
- `maxTokensField`
- `requiresToolResultName`
- `requiresMistralToolIds`

Do not add `compat` by default.

## Output expectations

When done:

1. Ensure `src/extensions/provider/models.ts` is updated.
2. Re-run `pnpm test -- src/extensions/provider/models.test.ts`.
3. If the change is user-facing, prepare a changeset per repo conventions.
4. Summarize what changed, including newly added, removed, or materially corrected models.

## Known repo paths

Use these exact paths in this repo:

- `src/extensions/provider/models.ts`
- `src/extensions/provider/models.test.ts`
