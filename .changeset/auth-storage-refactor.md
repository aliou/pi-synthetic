---
"@aliou/pi-synthetic": minor
---

Switch to Pi AuthStorage for credential handling

- Replace direct env var reads with AuthStorage wrapper
- Remove preflight subscription gating - tools/commands always register
- Credentials resolved at call time, not module load
- Resolve key inside each poll tick for sub-integration
- Clear error messages guide users to ~/.pi/agent/auth.json
- Remove web-search/hooks.ts (no longer needed)
