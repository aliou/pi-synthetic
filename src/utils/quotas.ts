import type { QuotasResponse } from "../types/quotas";

const API_KEY = process.env.SYNTHETIC_API_KEY;

export async function fetchQuotas(): Promise<QuotasResponse | null> {
  if (!API_KEY) return null;

  try {
    const response = await fetch("https://api.synthetic.new/v2/quotas", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!response.ok) return null;
    return (await response.json()) as QuotasResponse;
  } catch {
    return null;
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
