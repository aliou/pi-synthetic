import type { QuotasResponse, QuotasResult } from "../types/quotas";

const FETCH_TIMEOUT_MS = 15_000;

function isTimeoutReason(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "TimeoutError") ||
    (reason instanceof Error && reason.name === "TimeoutError")
  );
}

export async function fetchQuotas(
  apiKey: string,
  signal?: AbortSignal,
): Promise<QuotasResult> {
  if (!apiKey) {
    return {
      success: false,
      error: { message: "No API key provided", kind: "config" },
    };
  }

  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  const combined = AbortSignal.any(signals);

  try {
    const response = await fetch("https://api.synthetic.new/v2/quotas", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: combined,
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.text();
        if (body) {
          try {
            const parsed = JSON.parse(body) as { error?: string };
            if (parsed.error) message = parsed.error;
          } catch {
            message = body;
          }
        }
      } catch {
        return { success: false, error: { message, kind: "http" } };
      }
      return { success: false, error: { message, kind: "http" } };
    }

    const data: QuotasResponse = await response.json();
    return { success: true, data: { quotas: data } };
  } catch (err: unknown) {
    const isAbort =
      combined.aborted ||
      (err instanceof DOMException && err.name === "AbortError");
    if (isAbort) {
      if (isTimeoutReason(combined.reason)) {
        return {
          success: false,
          error: { message: "Request timed out", kind: "timeout" },
        };
      }
      return {
        success: false,
        error: { message: "Request cancelled", kind: "cancelled" },
      };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: { message, kind: "network" } };
  }
}

export function formatResetTime(renewsAt: string): string {
  const date = new Date(renewsAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "soon";

  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
