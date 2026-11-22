import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  SYNTHETIC_FAST_TOGGLE_EVENT,
  type SyntheticFastChangedPayload,
  type SyntheticFastTogglePayload,
} from "../../src/config";

const VIRTUAL_MODEL_API = "pi-virtual";

export function isVirtualModel(model: { api: string } | undefined): boolean {
  return model?.api === VIRTUAL_MODEL_API;
}

function latestResponse(
  branch: readonly SessionEntry[],
): AssistantMessage | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "assistant") continue;
    if (message.stopReason === "error" || message.stopReason === "aborted")
      continue;
    return message;
  }
  return undefined;
}

export function resolveFastModeModel(
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noExplicitAny: matches pi's ctx.model typing
): Model<any> | undefined {
  const selected = ctx.model;
  if (selected && !isVirtualModel(selected)) {
    return selected.provider === "synthetic" ? selected : undefined;
  }
  const routed = latestResponse(ctx.sessionManager.getBranch());
  return routed?.provider === "synthetic"
    ? ctx.modelRegistry.find("synthetic", routed.model)
    : undefined;
}

export function toggleFastMode(
  pi: ExtensionAPI,
  // biome-ignore lint/suspicious/noExplicitAny: matches pi's ctx.model typing
  model: Model<any>,
  respond?: (payload: SyntheticFastChangedPayload) => void,
): void {
  const payload: SyntheticFastTogglePayload = {
    model,
    ...(respond ? { respond } : {}),
  };
  pi.events.emit(SYNTHETIC_FAST_TOGGLE_EVENT, payload);
}
