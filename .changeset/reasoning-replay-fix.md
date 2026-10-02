---
"@aliou/pi-synthetic": patch
---

Fix cross-turn reasoning recall on DeepSeek-V4.1-Flash, syn:large:text (routes to DeepSeek), and GLM-5.3-Flash: add a per-model `reasoningReplay` catalog knob whose `onPayload` injector renames replayed assistant thinking to the wire field the served template renders (`reasoning_content`) and merges required `chat_template_kwargs` render flags (`clear_thinking: false` for GLM-5.3-Flash) on the openai-completions surface. Models without a knob are untouched.
