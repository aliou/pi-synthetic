---
"@aliou/pi-synthetic": minor
---

Adopt Pi 1.0.0.

- Dev dependencies and peer floors for `@earendil-works/pi-ai`, `pi-coding-agent`, and `pi-tui` move from 0.84.0 to 1.0.0 / `>=1.0.0`; the supported host range is Pi 1.0.0+.
- `synthetic_web_search` declares an `outputSchema` and returns `structuredContent` carrying full result bodies (capped at 1MB total, split evenly across results) so codemode scripts get machine-readable, complete results without extra file reads.
- `synthetic_web_search` declares `readOnlyHint` + `openWorldHint` annotations so permission extensions treat it as a read-only, open-world tool instead of prompting for confirmation.
- Synthetic models default `compat.supportsStrictMode: true` on the OpenAI-compatible surfaces (verified live against api.synthetic.new); per-model static overrides still win.
- Type-level fixes for pi's updated types: the model catalog narrows to the chat arm of pi's `ProviderModelConfig` union, api handler signatures use the branded `TranscriptContext`, and result detail types are type aliases to satisfy pi-ai's `JsonValue` strictness.
