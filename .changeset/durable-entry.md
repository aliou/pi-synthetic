---
"@aliou/pi-synthetic": minor
---

Add the `/durable` entry point: `createSyntheticExtension(options?)` builds a standalone pi-durable `Extension` carrying the `synthetic_web_search` tool. It reads no settings — credentials resolve through the host's `Models` or the `apiKey` option, and the utility API proxy comes from the `proxyUrl`/`proxyRequiresAuth` options. Truncated results save through the host's execution environment when one exists.
