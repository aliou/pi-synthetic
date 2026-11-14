import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  SYNTHETIC_FAST_TOGGLE_EVENT,
  type SyntheticFastChangedPayload,
  type SyntheticFastTogglePayload,
} from "../../src/config";

export function toggleFastMode(
  pi: ExtensionAPI,
  respond?: (payload: SyntheticFastChangedPayload) => void,
): void {
  const payload: SyntheticFastTogglePayload = respond ? { respond } : {};
  pi.events.emit(SYNTHETIC_FAST_TOGGLE_EVENT, payload);
}
