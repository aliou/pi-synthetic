---
"@aliou/pi-synthetic": minor
---

Redesign web search tool UI to match read_url pattern

- Use ToolCallHeader and ToolFooter from @aliou/pi-utils-ui for consistent styling
- Collapsed view shows result count with first result title and expand hint
- Expanded view shows each result with title, URL, published date, and a 5-line blockquote snippet rendered as Markdown
- Error handling uses throw instead of returning error details, matching the pi framework convention
- Errors now display the actual error message instead of misleading "no results"
- Footer shows result count only (no redundant "failed: no")
