---
"@aliou/pi-synthetic": patch
---

chore: bump `@aliou/pi-utils-settings` to `^0.19.1`

Switch schema generation from `ts-json-schema-generator` to `pi-settings-schema`, add a committed `schema.json`, and wire `buildSchemaUrl` into the config loader so saved settings files include a `$schema` field. No config migrations required.
