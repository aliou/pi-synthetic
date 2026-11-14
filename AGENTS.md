# pi-synthetic

Pi extension providing models available through the Synthetic provider.

## Commands

- `pnpm typecheck`, `pnpm lint`, `pnpm test` — the pre-commit hook runs all three; the full suite must pass, including a live comparison of the hardcoded catalog against the Synthetic API
- `pnpm gen:schema` — regenerate `schema.json` after changing `SyntheticConfig` in `src/config.ts`; `pnpm check:schema` verifies it
- `pi -e .` — run Pi against the local checkout

## Conventions

- Credentials resolve through Pi's provider auth: `~/.pi/agent/auth.json` (recommended), `SYNTHETIC_API_KEY`, or the provider's `apiKey` option. Auth `resolve` never fails and falls back to an anonymous empty key so the public catalog stays refreshable without credentials; `check` keeps the provider unconfigured (hidden from `/model`) until a key exists.
- Model calls go to `https://api.synthetic.new` on the surface set by the `api` config (`/openai/v1` or `/anthropic`); non-provider endpoints (`/v2/quotas`, `/v2/search`, `/openai/v1/models`) go through `src/client/synthetic-client.ts`.
- `src/` is pi-agnostic. `extensions/` is pi-coding-agent only. `provider/` and `durable/` are standalone entry points importing only `src/` plus their platform package.
- Quota data flows event-driven: the provider ingests the `x-synthetic-quotas` response header into `QuotaStore`, which broadcasts `synthetic:quotas:updated`; consumers request refreshes via `synthetic:quotas:request`. No polling.
- Quota history files are initialized and written only while the quota-warnings feature is enabled.
- Adding a config feature: field on `SyntheticConfig` in `src/config.ts` (its JSDoc feeds the generated schema), default in `extensions/_shared/config/loader.ts`, feature id in `src/config.ts`, settings row in `extensions/_shared/config/settings.ts`, and a feature registration emitted from the owning extension.

## Model catalog

`SYNTHETIC_MODELS` in `src/models.ts` is the offline fallback and the override source for `thinkingLevelMap`/`compat` settings the API does not expose; overrides merge by `id` on top of API-sourced fields in `buildSyntheticProviderModelsFromApi` and `buildSyntheticProviderModelsFromStore`.

The `syn:large:text`, `syn:small:text`, `syn:large:vision`, and `syn:small:vision` IDs are Synthetic's permanent category IDs routing to the current best model per category. They are concrete catalog entries carrying their own `thinkingLevelMap` overrides, not aliases.

`reasoningReplayField` is a static override set on concrete models only (currently `hf:deepseek-ai/DeepSeek-V4.1-Flash-1017`). It tells the OpenAI handler to replay thinking under that field instead of `reasoning`. During an API refresh, every model whose `hugging_face_id` matches a model carrying the override inherits it, so category IDs replay like the model they route to. The resolved value is persisted in the models store; `hugging_face_id` is not. Do not set it on category IDs.

To add a model, append to `SYNTHETIC_MODELS`: use the API's `id`/`name`, set `reasoning` from `supported_features`, `input` from `input_modalities`, and convert API prices to per-million rates including `pricing.input_cache_reads` — do not apply an additional cache discount. Take `contextWindow`/`maxTokens` from `context_length`/`max_output_length` (fall back to `https://models.dev/api.json` when the API omits `maxTokens`). Add overrides only when the API lacks what Pi needs; the dynamic refresh discovers new models automatically.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model catalog syncs (additions, removals, price/metadata updates)
- `minor`: features
- `major`: breaking changes
