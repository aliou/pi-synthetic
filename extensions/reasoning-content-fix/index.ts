/**
 * Synthetic reasoning-content fix (asb's workaround, adapted for aliou/pi-synthetic).
 *
 * Synthetic streams reasoning for some models (DeepSeek-V4.1-Flash,
 * DeepSeek-V4.1-Flash-1017, GLM-4.7-Flash, Nemotron-3-Super, gpt-oss-120b)
 * as `reasoning` instead of `reasoning_content`. Pi replays it in the same
 * field, but Synthetic only reads replayed reasoning from `reasoning_content`,
 * so reasoning is silently dropped on follow-up turns in streaming mode.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    const baseUrl = (ctx.model?.baseUrl ?? "").toString();
    if (!baseUrl.includes("api.synthetic.new")) return;

    const payload = event.payload as { messages?: unknown[] } | undefined;
    if (!payload?.messages) return;

    for (const msg of payload.messages) {
      if (!msg || typeof msg !== "object") continue;
      const m = msg as Record<string, unknown>;
      const reasoning = m.reasoning;
      if (reasoning !== undefined && reasoning !== null) {
        (m as any).reasoning_content = (m as any).reasoning_content ?? reasoning;
        delete m.reasoning;
      }
    }
  });
}
