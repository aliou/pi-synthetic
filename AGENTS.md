# pi-synthetic

Pi extension providing models available through the Synthetic provider.

## Structure

`extensions/provider/` is the provider extension (static fallback catalog, API-driven model refresh with a 4-hour store cache, quota-header ingestion); `extensions/web-search/` registers the `synthetic_web_search` tool; `extensions/command-quotas/` serves the quotas TUI; `extensions/quota-warnings/` owns transition-based warnings and the persistent JSONL quota history; `extensions/usage-status/` is the footer status bar. `src/client/` holds the Synthetic API client (quotas, web search, model list, utility-API proxy detection); `src/services/` the pi-agnostic quota store, history, and warnings; `src/utils/` the quota formatters, severity math, and refill-aware projections; `src/config.ts` and `src/migrations.ts` the settings and versioned config migrations.

## Conventions

- Credentials come from Pi's provider auth resolution: `~/.pi/agent/auth.json` (recommended), `SYNTHETIC_API_KEY` environment variable, or the `apiKey: "$SYNTHETIC_API_KEY"` configured on the provider
- Provider uses OpenAI-compatible API at `https://api.synthetic.new/openai/v1`
- Non-provider Synthetic endpoints (`/v2/quotas`, `/v2/search`, `/openai/v1/models`) go through `src/client/synthetic-client.ts`
- Models are fetched dynamically from `https://api.synthetic.new/openai/v1/models` and cached in the pi models store with a 4-hour TTL; see `extensions/provider/refresh-models.ts`
- The provider registers itself to pi as a pi-ai `Provider` object; auth `resolve` never fails and falls back to an anonymous empty-key credential so the public model catalog stays refreshable without a key, while `check` keeps the provider unconfigured (models hidden from `/model`) until a key exists
- The hardcoded catalog in `extensions/provider/models.ts` is kept as an offline fallback and as the override source for model-specific compatibility settings (`thinkingLevelMap`, `compat`) that the API does not expose
- All user-facing model selection still uses the Pi provider name `synthetic`
- Web search tool and quotas command are always registered; they fail at call time if credentials/subscription are missing unless an unauthenticated utility API proxy is configured
- Error messages guide users to add credentials to `~/.pi/agent/auth.json`, set `SYNTHETIC_API_KEY`, or configure an unauthenticated utility API proxy when relevant
- Quota data flows event-driven: provider ingests `x-synthetic-quotas` header from `after_provider_response` into `QuotaStore`, which broadcasts via `synthetic:quotas:updated`; consumers (usage-status, quota-warnings) listen and request refreshes via `synthetic:quotas:request` — no polling
- Persistent quota history is owned by the quota-warnings extension. It initializes and writes only while `quotaWarnings` is enabled; users who leave warnings disabled get no history directory or files
- There is no `provider` field on the Pi model config and no per-model upstream-host concept. The `provider` field exists only on the raw Synthetic API response (`SyntheticApiModel.provider`) and is not stored on registered models

## Model catalog

`SYNTHETIC_MODELS` in `extensions/provider/models.ts` is the static fallback catalog and the override source for model-specific compatibility settings (`thinkingLevelMap`, `compat`) the API does not expose. Static entries use the `SyntheticModel` type in that file; the raw API response is `SyntheticApiModel` in `src/client/types.ts`. Overrides are matched by `id` and merged on top of API-sourced fields in `buildSyntheticProviderModelsFromApi` and `buildSyntheticProviderModelsFromStore`.

To add a model, append to `SYNTHETIC_MODELS` using the API's `id`/`name`, set `reasoning` from `supported_features`, `input` from `input_modalities`, and convert API prices to per-million rates, including `pricing.input_cache_reads` — do not apply an additional cache discount. Take `contextWindow`/`maxTokens` from `context_length`/`max_output_length` (fall back to `https://models.dev/api.json` when the API omits `maxTokens`). Add overrides only when the API lacks what Pi needs. The dynamic refresh discovers new models automatically; static entries exist for offline fallback and overrides only.

The `syn:large:text`, `syn:small:text`, `syn:large:vision`, and `syn:small:vision` IDs are Synthetic's permanent category model IDs routing to the current best model per category. They are concrete catalog entries carrying their own `thinkingLevelMap` overrides, not aliases.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes, model catalog syncs (additions, removals, price/metadata updates)
- `minor`: features
- `major`: breaking changes
