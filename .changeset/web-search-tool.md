---
"@aliou/pi-synthetic": minor
---

Add Synthetic web search tool

New tool `synthetic_web_search` allows agents to search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates.

**Note:** Search is a subscription-only feature. The tool will only be registered if the `SYNTHETIC_API_KEY` belongs to an active subscription (verified via the usage endpoint).
