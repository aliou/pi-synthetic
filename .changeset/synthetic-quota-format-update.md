---
"@aliou/pi-synthetic": minor
---

Add support for new Synthetic API quota format with weekly token credits and rolling 5-hour limits

- Display weekly token quota with credits-based tracking ($X.XX/$Y.YY format)
- Show rolling 5-hour request quota with tick-based regeneration
- Use simple indicator bar for new quota types (marker instead of fill)
- Display regeneration info: "+$X.XX in Xh" for credits, "+X in Xm" for requests
- Maintain backward compatibility with legacy subscription format
- Fix division-by-zero bugs and fragile currency parsing
- Harden edge cases with safePercent() and parseCurrency() helpers
