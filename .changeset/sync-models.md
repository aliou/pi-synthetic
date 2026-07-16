---
"@aliou/pi-synthetic": minor
---

Synchronize Synthetic models from the provider API

- Provider models are now fetched asynchronously from `https://api.synthetic.new/openai/v1/models` using Pi 0.80.8's `ProviderConfig.refreshModels` API.
- Discovered models are persisted through `context.store` with a 4-hour TTL, so the catalog is available offline and refresh is cheap when the cache is fresh.
- The hardcoded catalog is kept as an offline fallback and as the override source for model-specific compatibility settings (`thinkingLevelMap`, `compat`) that the API does not expose.
- Removed the `proxiedModels` setting and alias resolution; Synthetic no longer distinguishes proxied models, and the API returns `syn:*` entries as concrete models.
- Updated auth resolution to use `ModelRegistry.getApiKeyForProvider` for compatibility with Pi 0.80.8.
