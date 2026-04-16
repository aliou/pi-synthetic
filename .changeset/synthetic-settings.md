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

Add an initial `v1-seed-defaults` migration that writes the current
defaults to disk and bumps `configVersion` to 1. On first load, fresh
installs seed the global config automatically. A one-time notice is
shown on session start pointing users to `pi config` and the
`/synthetic:settings` command.
