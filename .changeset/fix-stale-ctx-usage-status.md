---
"@aliou/pi-synthetic": patch
---

Fix crash on Pi reload from stale ExtensionContext in usage-status timer

The setInterval timer in `createStatusRefresher` captures an `activeContext` reference that becomes stale after Pi session replacement or reload. Pi's `ExtensionContext.hasUI` is a getter that calls `assertActive()`, which throws on stale contexts. The timer callback and several other code paths touched stale `ctx` properties without checking liveness, causing Pi to crash on reload.
