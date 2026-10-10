import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  SYNTHETIC_QUOTAS_READ_EVENT,
  SYNTHETIC_QUOTAS_REQUEST_EVENT,
  type SyntheticQuotasReadPayload,
  type SyntheticQuotasRequestPayload,
  type SyntheticQuotasSnapshotPayload,
} from "../../src/types/quotas";

/**
 * Emit a request to refresh quotas from the Synthetic API.
 *
 * `respond` is optional: callers that only want to trigger a refresh
 * (e.g. usage-status) omit it and pass undefined.
 */
export function requestQuotas(
  pi: ExtensionAPI,
  respond?: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void,
): void {
  pi.events.emit(SYNTHETIC_QUOTAS_REQUEST_EVENT, {
    respond,
  } satisfies SyntheticQuotasRequestPayload);
}

/**
 * Read the current cached quota snapshot from the store without an API call.
 */
export function readQuotas(
  pi: ExtensionAPI,
  respond: (snapshot: SyntheticQuotasSnapshotPayload | undefined) => void,
): void {
  pi.events.emit(SYNTHETIC_QUOTAS_READ_EVENT, {
    respond,
  } satisfies SyntheticQuotasReadPayload);
}
