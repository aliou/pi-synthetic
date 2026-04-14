---
"@aliou/pi-synthetic": minor
---

Add quota-warnings extension: automatic notifications when approaching or exceeding Synthetic API quotas

- Extract quota severity logic into shared `src/utils/quotas-severity.ts` (4-level RiskSeverity: none/warning/high/critical with usedFloor gating, showPace/paceScale support, limited flag handling)
- Refactor quotas TUI display to use shared severity utils
- New quota-warnings extension hooks into session_start and agent_end to check quotas and emit ctx.ui.notify() on severity transitions
- Transition-only notifications: escalation always notifies, high/critical have no cooldown, warning has 60min cooldown
- Notification messages use correct terminology (regen/tick/resets) and precise time formatting (2h13m)
