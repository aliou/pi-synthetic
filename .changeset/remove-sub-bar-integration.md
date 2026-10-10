---
"@aliou/pi-synthetic": minor
---

Remove the built-in sub-bar integration from the package. It is now distributed as a standalone one-off pi extension installed with `pi install https://gist.github.com/aliou/7cce00c3be0c4c94e2bb305a215f5d93` (frozen, unmaintained). The `subBarIntegration` config option was removed; a config migration drops it and points remaining users at the gist.
