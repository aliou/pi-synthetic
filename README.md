![banner](https://assets.aliou.me/github/aliou/pi-synthetic/banner.png)

# pi-synthetic

A [Pi](https://pi.dev) extension that adds [Synthetic](https://gnldxt.link/ref-syn) as a model provider: open-source models, an optional zero-data-retention web search tool, and live quota tracking.

## Setup

1. Get an API key (referral link): [synthetic.new](https://gnldxt.link/ref-syn)
2. Install:

   ```bash
   pi install npm:@aliou/pi-synthetic
   ```

3. Run `/login synthetic` and paste the key.

Without a key the extension still loads, but no models appear in `/model` until credentials exist.

## Usage

Select the provider and pick a model:

```
/model synthetic syn:large:text
```

The `syn:large:text`-style category IDs always route to the current best model in their category.

### Features

- **Web search** — adds an optional `synthetic_web_search` tool, zero data retention. It appears once a session-start check confirms a Synthetic subscription. [Read more about it](https://dev.synthetic.new/docs/synthetic/search).
- **Provider API** — pick the OpenAI-compatible or Anthropic-compatible surface under `/synthetic:settings` → **Provider > API** (default `openai-completions`, applies after `/reload`). The Anthropic surface streams real thinking blocks and native tool calls; some models cannot turn reasoning off on it.
- **Fast mode** — `/synthetic:fast` toggles the current session's model between the regular and `fast:` variant (the fast one uses twice the quota). Optionally enable **Provider > Fast Models** to register a `fast:` variant of every model for direct selection in `/model` (applies after `/reload`). The usage widget shows `⚡` while a fast model is selected.
- **Quotas** — `/synthetic:quotas` shows current usage; the footer widget shows live quota percentages; quota warnings notify on severity transitions. History for projections is stored locally (up to 14 days) and only while warnings are enabled.

## Library Use

The provider is also published as `@aliou/pi-synthetic/provider` for hosts building on pi-ai, so the same Synthetic models and catalog work outside the coding agent:

```ts
import { createModels } from "@earendil-works/pi-ai";
import createSyntheticProvider from "@aliou/pi-synthetic/provider";

const models = createModels({ credentials, modelsStore });
models.setProvider(createSyntheticProvider({ api: "openai-completions" }));
await models.refresh();
```

The durable extension is available as `@aliou/pi-synthetic/durable` and ships only the `synthetic_web_search` tool for pi-durable hosts:

```ts
import { createRegistry } from "@earendil-works/pi-durable";
import createSyntheticExtension from "@aliou/pi-synthetic/durable";

createRegistry().install(createSyntheticExtension());
```

## Disabling Features

Turn features off with their toggles in `/synthetic:settings`. Entire extensions can also be disabled via `pi config`, or with `+`/`-` prefixed paths under the package's `extensions` entry in `~/.pi/agent/settings.json` (e.g. `"-extensions/usage-status/index.ts"`). The extension directories are `provider`, `web-search`, `fast-mode`, `command-quotas`, `usage-status`, and `quota-warnings`.

## Links

- [Synthetic](https://gnldxt.link/ref-syn) · [API docs](https://dev.synthetic.new/docs/api/overview) · [Web search docs](https://dev.synthetic.new/docs/synthetic/search)
- [Pi documentation](https://pi.dev)
