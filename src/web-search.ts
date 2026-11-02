import { type Static, Type } from "typebox";
import type { SyntheticSearchResult } from "./client/types";

export const SYNTHETIC_WEB_SEARCH_TOOL = "synthetic_web_search" as const;

const MAX_INLINE_SEARCH_BYTES = 20_000;
const MAX_INLINE_SEARCH_RESULT_BYTES = 4_000;
const MAX_INLINE_SEARCH_RESULT_LINES = 1_000;

// Byte budget for structuredContent, split evenly across results.
export const MAX_STRUCTURED_SEARCH_BYTES = 1_048_576;

export type WebSearchResultDetails = {
  title: string;
  url: string;
  published: string;
  truncated: boolean;
  tempFilePath?: string;
  totalLines: number;
  totalBytes: number;
  excerptBytes: number;
};

export const SearchParams = Type.Object({
  query: Type.String({
    description: "The search query. Be specific for best results.",
  }),
});

export const SearchOutputSchema = Type.Object({
  query: Type.String(),
  results: Type.Array(
    Type.Object({
      title: Type.String(),
      url: Type.String(),
      published: Type.String(),
      text: Type.String({
        description: `Full result body, cut only at ${formatSize(MAX_STRUCTURED_SEARCH_BYTES)} total shared evenly across results. Longer bodies are truncated.`,
      }),
      truncated: Type.Boolean({
        description:
          "True when the text was cut at the structured-output budget.",
      }),
      tempFilePath: Type.Optional(Type.String()),
    }),
  ),
});

export type SearchOutput = Static<typeof SearchOutputSchema>;

/**
 * Persists one full result body and returns the path a reader can open, or
 * `undefined` when this host has nowhere to keep it.
 */
export type SaveSearchResultFile = (
  text: string,
  slug: string,
) => Promise<string | undefined>;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function truncateUtf8(value: string, maxBytes: number): string {
  let content = "";
  let bytes = 0;

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character);
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    content += character;
    bytes += characterBytes;
  }

  return content;
}

interface Truncation {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
}

function truncateHead(
  content: string,
  maxLines: number,
  maxBytes: number,
): Truncation {
  const totalBytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return { content, truncated: false, totalLines, totalBytes };
  }
  if (Buffer.byteLength(lines[0] ?? "", "utf8") > maxBytes) {
    return { content: "", truncated: true, totalLines, totalBytes };
  }

  const kept: string[] = [];
  let bytes = 0;
  for (const [index, line] of lines.entries()) {
    if (index >= maxLines) break;
    const lineBytes = Buffer.byteLength(line, "utf8") + (index > 0 ? 1 : 0);
    if (bytes + lineBytes > maxBytes) break;
    kept.push(line);
    bytes += lineBytes;
  }
  return { content: kept.join("\n"), truncated: true, totalLines, totalBytes };
}

interface FormatWebSearchResultsOptions {
  maxInlineBytes?: number;
  maxInlineBytesPerResult?: number;
  maxStructuredBytes?: number;
  saveResult?: SaveSearchResultFile;
}

export async function formatWebSearchResults(
  results: SyntheticSearchResult[],
  {
    maxInlineBytes = MAX_INLINE_SEARCH_BYTES,
    maxInlineBytesPerResult = MAX_INLINE_SEARCH_RESULT_BYTES,
    maxStructuredBytes = MAX_STRUCTURED_SEARCH_BYTES,
    saveResult,
  }: FormatWebSearchResultsOptions = {},
): Promise<{
  content: string;
  resultDetails: WebSearchResultDetails[];
  structuredResults: SearchOutput["results"];
  maxBytesPerResult: number;
  maxStructuredBytesPerResult: number;
}> {
  const maxBytesPerResult =
    results.length === 0
      ? 0
      : Math.min(
          maxInlineBytesPerResult,
          Math.floor(maxInlineBytes / results.length),
        );
  const maxStructuredBytesPerResult =
    results.length === 0 ? 0 : Math.floor(maxStructuredBytes / results.length);
  let content = `Found ${results.length} result(s):\n\n`;
  const resultDetails: WebSearchResultDetails[] = [];
  const structuredResults: SearchOutput["results"] = [];

  for (const result of results) {
    const slug = result.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);
    const truncation = truncateHead(
      result.text,
      MAX_INLINE_SEARCH_RESULT_LINES,
      maxBytesPerResult,
    );

    let inline = truncation.content;
    let tempFilePath: string | undefined;
    let excerptBytes = Buffer.byteLength(inline);

    if (truncation.truncated) {
      // truncateHead preserves complete lines. Fall back to a byte-safe prefix
      // when a single line is larger than the shared result budget.
      if (!inline) {
        inline = truncateUtf8(result.text, maxBytesPerResult);
      }
      excerptBytes = Buffer.byteLength(inline);

      tempFilePath = saveResult
        ? await saveResult(result.text, slug)
        : undefined;

      const separator = inline ? "\n\n" : "";
      let note = `[Content truncated to ${formatSize(excerptBytes)}.`;
      if (tempFilePath) {
        note += ` Full result saved to: ${tempFilePath}. Use the read tool to inspect it.`;
      }
      note += "]";
      inline += `${separator}${note}`;
    }

    content += `## ${result.title}\n`;
    content += `URL: ${result.url}\n`;
    content += `Published: ${result.published}\n`;
    content += `\n${inline}\n`;
    content += "\n---\n\n";

    const structuredText =
      truncation.totalBytes <= maxStructuredBytesPerResult
        ? result.text
        : truncateUtf8(result.text, maxStructuredBytesPerResult);
    const structured: {
      title: string;
      url: string;
      published: string;
      text: string;
      truncated: boolean;
      tempFilePath?: string;
    } = {
      title: result.title,
      url: result.url,
      published: result.published,
      text: structuredText,
      truncated: Buffer.byteLength(structuredText) < truncation.totalBytes,
    };
    if (tempFilePath !== undefined) {
      structured.tempFilePath = tempFilePath;
    }
    structuredResults.push(structured);

    resultDetails.push({
      title: result.title,
      url: result.url,
      published: result.published,
      truncated: truncation.truncated,
      tempFilePath,
      totalLines: truncation.totalLines,
      totalBytes: truncation.totalBytes,
      excerptBytes,
    });
  }

  return {
    content,
    resultDetails,
    structuredResults,
    maxBytesPerResult,
    maxStructuredBytesPerResult,
  };
}
