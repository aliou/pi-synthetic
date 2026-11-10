---
"@aliou/pi-synthetic": patch
---

Retry Synthetic HTTP 408 responses. Synthetic relays upstream inference backend timeouts as `408 status code (no body)`, which Pi's retry classifier did not treat as transient, so a model call failed outright. The provider extension now rewrites those error messages with a `timeout:` prefix, matching Pi's retryable error pattern like the existing `context_length_exceeded:` normalization.
