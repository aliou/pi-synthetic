const FETCH_TIMEOUT_MS = 15_000;

export function isTimeoutReason(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "TimeoutError") ||
    (reason instanceof Error && reason.name === "TimeoutError")
  );
}

export function combineWithTimeout(signal?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  return AbortSignal.any(signals);
}

export function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export async function parseErrorMessage(response: Response): Promise<string> {
  const message = response.statusText;
  try {
    const body = await response.text();
    if (!body) return message;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      return parsed.error || body;
    } catch {
      return body;
    }
  } catch {
    return message;
  }
}
