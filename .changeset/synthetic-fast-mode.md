---
"@aliou/pi-synthetic": minor
---

Add Synthetic fast mode.

- `/synthetic:fast` switches the current session's model to its `fast:` variant, which the API resolves to the fast version; it only enables — running it while a fast model is already selected reports that fast mode is active, and returning to the regular model is a normal model switch (e.g. `/model`)
- The `synthetic:fast:toggle` event gives other extensions the same switch; because fast mode is the selected model, it survives resume and fork with no extra state
- The new **Provider > Fast Models** setting registers a `fast:` variant of every catalog model for direct selection in `/model` (applies after `/reload`)
- Reported costs double across all token classes (input, output, cache reads, and cache writes), matching Synthetic's fast-mode billing
- The usage status bar shows a `⚡` indicator while a fast model is selected
