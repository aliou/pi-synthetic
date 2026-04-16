---
"@aliou/pi-synthetic": minor
---

feat(settings): make synthetic features configurable

Add shared Synthetic feature settings with a `synthetic:settings`
command and `pi config` support. Web search, usage status, quota
warnings, quotas command, and subBar integration can now be enabled
or disabled individually. Web search, usage status, quota warnings,
and subBar polling react to settings changes live. The quotas command
still requires restart to fully unload.
