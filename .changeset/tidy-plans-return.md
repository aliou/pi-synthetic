---
"@aliou/pi-synthetic": patch
---

Replay DeepSeek-V4.1-Flash and DeepSeek-V4.1-Flash-1017 OpenAI thinking under
`reasoning_content` when it was streamed under `reasoning`, without changing
saved session history. This preserves reasoning on tool-enabled requests;
server-side preservation without tool declarations remains model-dependent.
Other models and Anthropic requests are unchanged.
