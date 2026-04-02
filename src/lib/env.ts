export function hasSyntheticApiKey(): boolean {
  return Boolean(process.env.SYNTHETIC_API_KEY);
}

export function getSyntheticApiKey(): string {
  return process.env.SYNTHETIC_API_KEY || "";
}
