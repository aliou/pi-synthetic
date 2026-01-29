---
"@aliou/pi-synthetic": minor
---

Switch from Anthropic to OpenAI API endpoints

- Change API endpoint from `/anthropic` to `/openai/v1`
- Update from `anthropic-messages` to `openai-completions` API
- Add compatibility flags for proper role handling (`supportsDeveloperRole: false`)
- Use standard `max_tokens` field instead of `max_completion_tokens`
