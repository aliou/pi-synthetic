export const SYNTHETIC_PROVIDER_ID = "synthetic";

/** OpenAI-compatible chat completions endpoint root. */
export const SYNTHETIC_BASE_URL = "https://api.synthetic.new/openai/v1";

/**
 * Anthropic-compatible messages endpoint root. The Anthropic SDK appends
 * `/v1/messages` to the client base URL, so the trailing `/v1` is stripped.
 */
export const SYNTHETIC_ANTHROPIC_BASE_URL =
  "https://api.synthetic.new/anthropic";

export const SYNTHETIC_API_KEY_ENV = "SYNTHETIC_API_KEY";

export const SYNTHETIC_REQUEST_HEADERS = {
  Referer: "https://pi.dev",
  "X-Title": "npm:@aliou/pi-synthetic",
};
