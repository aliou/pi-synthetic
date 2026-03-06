---
name: update-synthetic-model
description: Update model metadata for the pi-synthetic extension. Use when adding or refreshing entries in src/providers/models.ts, especially to verify pricing, context, max tokens, input modalities, and reasoning support from Synthetic, then compare against models.dev for the synthetic provider and, if absent there, compare against other providers for the same model.
---

# Update Synthetic model

Update `src/providers/models.ts` from live data, not guesswork.

## Sources of truth

Use these in order:

1. Synthetic models endpoint: `https://api.synthetic.new/openai/v1/models`
2. Synthetic runtime behavior: direct `chat/completions` calls
3. `https://models.dev/api.json` under `.synthetic.models`
4. If a model is missing on models.dev for `synthetic`, inspect the same model under other providers on models.dev for likely `input` and `reasoning` defaults, then confirm with Synthetic runtime calls when possible.

## Update flow

1. Read `src/providers/models.ts`.
2. Query Synthetic models endpoint with `bash` + `jq`.
3. Copy over fields Synthetic explicitly exposes:
   - `id`
   - `name`
   - `context_length` -> `contextWindow`
   - `pricing.prompt` -> `cost.input` per 1M
   - `pricing.completion` -> `cost.output` per 1M
   - `pricing.input_cache_reads` -> `cost.cacheRead` per 1M
   - `pricing.input_cache_writes` -> `cost.cacheWrite` per 1M
   - `input_modalities` -> `input`
4. Compare the same model against `models.dev` synthetic entry.
5. If `models.dev` has a Synthetic entry, use it to cross-check:
   - `reasoning`
   - `modalities.input`
   - output limit / max tokens
6. If `models.dev` does not yet list that model for Synthetic:
   - inspect the same model on other providers in `models.dev`
   - use that only as supporting evidence for `input` / `reasoning`
   - then manually test Synthetic runtime behavior before changing `reasoning` or multimodal input
7. If Synthetic metadata and runtime disagree, prefer confirmed runtime behavior, but note the discrepancy in a comment or commit message.
8. Review whether the model needs a `compat` override. Do not add compat fields by default. Add them only when a live request or provider docs show a request-shaping quirk.

## Required commands

### 1) Synthetic models endpoint

Use `bash` + `jq`, example:

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
      pricing,
      supported_features
    }' --arg id 'hf:zai-org/GLM-4.7-Flash'
```

### 2) models.dev synthetic comparison

Check Synthetic provider entry:

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
    | map({provider, reasoning: .model.reasoning, input: .model.modalities.input})'
```

## Required manual runtime checks

Do not rely only on metadata for `reasoning` or multimodal support.

Use the environment variable `SYNTHETIC_API_KEY`. Never print it.

### Reasoning check

Send a minimal request with `reasoning_effort`:

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

Treat `reasoning` as supported if the request succeeds and the response includes reasoning output such as `reasoning_content`, or otherwise clearly accepts reasoning mode.

### Image input check

Test image input directly with a tiny inline data URL:

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

If Synthetic returns an error like `does not appear to support image inputs`, keep `input: ["text"]`.

## Compat object

`src/providers/models.ts` supports an optional `compat` object per model. Pi consumes this to shape requests for OpenAI-compatible providers.

Only add `compat` when needed. Current useful fields in this repo:

- `supportsDeveloperRole`: set `false` when the provider expects `system` instead of `developer`
- `supportsReasoningEffort`: set `true` when live Synthetic requests confirm `reasoning_effort` works
- `maxTokensField`: set to:
  - `"max_completion_tokens"` when a model behaves correctly with that field and fails or misbehaves with `max_tokens`
  - `"max_tokens"` otherwise
- `requiresToolResultName`: only if tool-result requests fail without a `name`
- `requiresMistralToolIds`: only for Mistral-specific tool id quirks

Default Synthetic provider behavior is set in `src/providers/index.ts`. Per-model `compat` overrides are merged on top of that default.

Add `compat` for a model when at least one of these is true:

1. Synthetic docs require a non-default request field
2. A direct Synthetic API call succeeds only with a different field layout
3. Pi/proxy capture shows the generated request shape is causing errors

Example:

```ts
compat: {
  supportsReasoningEffort: true,
  maxTokensField: "max_completion_tokens",
}
```

## Decision rules

- Set `input` from Synthetic endpoint first.
- Set `reasoning` from:
  1. Synthetic runtime check
  2. else models.dev synthetic
  3. else other providers on models.dev as weak evidence only
- Set pricing from Synthetic endpoint.
- Set `maxTokens` from models.dev when Synthetic does not expose it clearly.
- Keep compat defaults unless live behavior shows a model-specific quirk.
- If evidence is mixed, prefer confirmed Synthetic runtime behavior.

## Current known example

For `hf:zai-org/GLM-4.7-Flash`:
- Synthetic endpoint reports `input_modalities: ["text"]`
- Synthetic runtime rejects image input
- Synthetic runtime accepts `reasoning_effort` and returns reasoning output
- Result: `input: ["text"]`, `reasoning: true`
