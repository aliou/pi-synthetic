---
"@aliou/pi-synthetic": patch
---

Use the `keyHint()` injected into the tool render context for the web-search expand hint instead of importing it from `@earendil-works/pi-coding-agent`. An import can resolve to the extension's own copy of the package, which does not see pi's keybindings, so the hint rendered without the key. Raises the pi-coding-agent peer range to `>=1.5.0`.
