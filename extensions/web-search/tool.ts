import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  defineTool,
  formatSize,
  keyHint,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
  type SyntheticSearchResponse,
  type SyntheticSearchResult,
} from "../../src/client";
import { configLoader } from "../../src/config";

export const SYNTHETIC_WEB_SEARCH_TOOL = "synthetic_web_search" as const;
const MAX_INLINE_SEARCH_BYTES = 20_000;
const MAX_INLINE_SEARCH_RESULT_BYTES = 4_000;
const MAX_INLINE_SEARCH_RESULT_LINES = 1_000;

export interface WebSearchResultDetails {
  title: string;
  url: string;
  published: string;
  truncated: boolean;
  tempFilePath?: string;
  totalLines: number;
  totalBytes: number;
  excerptBytes: number;
}

interface WebSearchDetails {
  results?: WebSearchResultDetails[];
  query?: string;
}

const SearchParams = Type.Object({
  query: Type.String({
    description: "The search query. Be specific for best results.",
  }),
});

type SearchParamsType = Static<typeof SearchParams>;

type WriteSearchResultFile = (
  path: string,
  content: string,
  encoding: "utf8",
) => Promise<void>;

interface FormatWebSearchResultsOptions {
  maxInlineBytes?: number;
  maxInlineBytesPerResult?: number;
  writeResultFile?: WriteSearchResultFile;
}

function truncateUtf8(value: string, maxBytes: number): string {
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

export async function formatWebSearchResults(
  results: SyntheticSearchResult[],
  {
    maxInlineBytes = MAX_INLINE_SEARCH_BYTES,
    maxInlineBytesPerResult = MAX_INLINE_SEARCH_RESULT_BYTES,
    writeResultFile = writeFile,
  }: FormatWebSearchResultsOptions = {},
): Promise<{
  content: string;
  resultDetails: WebSearchResultDetails[];
  maxBytesPerResult: number;
}> {
  const maxBytesPerResult =
    results.length === 0
      ? 0
      : Math.min(
          maxInlineBytesPerResult,
          Math.floor(maxInlineBytes / results.length),
        );
  let content = `Found ${results.length} result(s):\n\n`;
  const resultDetails: WebSearchResultDetails[] = [];

  for (const result of results) {
    const slug = result.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);
    const truncation = truncateHead(result.text, {
      maxLines: MAX_INLINE_SEARCH_RESULT_LINES,
      maxBytes: maxBytesPerResult,
    });

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

      // Keep an equally sized excerpt for every result, while preserving the
      // complete response outside the model context for targeted follow-up.
      tempFilePath = join(
        tmpdir(),
        `pi-synthetic-search-${slug}-${randomBytes(4).toString("hex")}.md`,
      );
      await writeResultFile(tempFilePath, result.text, "utf8");
      const separator = inline ? "\n\n" : "";
      inline += `${separator}[Content truncated to ${formatSize(excerptBytes)}. Full result saved to: ${tempFilePath}. Use the read tool to inspect it.]`;
    }

    content += `## ${result.title}\n`;
    content += `URL: ${result.url}\n`;
    content += `Published: ${result.published}\n`;
    content += `\n${inline}\n`;
    content += "\n---\n\n";

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

  return { content, resultDetails, maxBytesPerResult };
}

export const syntheticWebSearchTool = defineTool({
  name: SYNTHETIC_WEB_SEARCH_TOOL,
  label: "Synthetic: Web Search",
  description: `Search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates. Use for finding documentation, articles, recent information, or any web content. Results are fresh and not cached by Synthetic. Body excerpts share a 20KB budget, with an equal 4KB maximum per result. Larger results include a bounded excerpt and are saved to temp files for full inspection with the read tool.`,
  promptSnippet: "Search the web using Synthetic's zero-data-retention API",
  promptGuidelines: [
    "Use synthetic_web_search for finding documentation, articles, recent information, or any web content.",
    "Write specific queries with names, dates, versions, or locations for synthetic_web_search.",
    "synthetic_web_search results are fresh and not cached by Synthetic.",
  ],
  parameters: SearchParams,

  async execute(_toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({
      content: [{ type: "text", text: "Searching..." }],
      details: { query: params.query },
    });

    const config = configLoader.getConfig();
    if (!config.webSearch) {
      throw new Error(
        "Synthetic web search is disabled. Re-enable it with synthetic:settings or pi config.",
      );
    }

    const clientOptions = await resolveSyntheticClientOptions(config, () =>
      ctx.modelRegistry.getApiKeyForProvider("synthetic"),
    );
    if (!clientOptions) {
      throw new Error(
        "Synthetic web search requires a Synthetic subscription or an unauthenticated proxy. Add credentials to ~/.pi/agent/auth.json, set SYNTHETIC_API_KEY, or disable proxy auth in /synthetic:settings.",
      );
    }

    let data: SyntheticSearchResponse;
    try {
      const client = new SyntheticClient(clientOptions);
      data = await client.search(params.query, { signal });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Search failed";
      throw new Error(`Synthetic web search: ${message}`);
    }

    const { content, resultDetails } = await formatWebSearchResults(
      data.results,
    );

    return {
      content: [{ type: "text", text: content }],
      details: {
        results: resultDetails,
        query: params.query,
      },
    };
  },

  renderCall(args: SearchParamsType, theme: Theme, _context) {
    return new ToolCallHeader(
      {
        toolName: "Synthetic: WebSearch",
        mainArg: `"${args.query}"`,
        showColon: true,
      },
      theme,
    );
  },

  renderResult(result, options, theme: Theme, context) {
    const { expanded, isPartial } = options;

    if (isPartial) {
      return new Text(
        theme.fg("muted", "Synthetic: WebSearch: fetching..."),
        0,
        0,
      );
    }

    const details = result.details as WebSearchDetails | undefined;
    const results = details?.results || [];
    const container = new Container();

    // When the tool throws, the framework calls renderResult with
    // details={} (empty object) and the error message in content.
    // Detect this both via context.isError and missing expected details.
    if (context.isError || !details?.results) {
      const textBlock = result.content.find((c) => c.type === "text");
      const errorMsg =
        (textBlock?.type === "text" && textBlock.text) || "Search failed";
      container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
      return container;
    }

    const hasTruncation = results.some((r) => r.truncated);

    if (results.length === 0) {
      container.addChild(
        new Text(theme.fg("muted", "Synthetic: WebSearch: no results"), 0, 0),
      );
    } else if (!expanded) {
      // Collapsed: show result count + first result title
      let text = theme.fg("success", `Found ${results.length} result(s)`);
      if (hasTruncation) {
        text += theme.fg("warning", " (excerpted)");
      }
      const first = results[0];
      if (first) {
        text += `\n  ${theme.fg("dim", first.title)}`;
        if (results.length > 1) {
          text += theme.fg("dim", ` (+${results.length - 1} more)`);
        }
      }
      text += theme.fg("muted", ` ${keyHint("app.tools.expand", "to expand")}`);
      container.addChild(new Text(text, 0, 0));
    } else {
      // Expanded: show each result with title, URL, date, and snippet
      container.addChild(
        new Text(
          theme.fg("success", `Found ${results.length} result(s)`),
          0,
          0,
        ),
      );

      for (const r of results) {
        container.addChild(new Text("", 0, 0));
        container.addChild(
          new Text(
            `${theme.fg("dim", ">")} ${theme.fg("accent", theme.bold(r.title))}`,
            0,
            0,
          ),
        );
        container.addChild(new Text(`  ${theme.fg("dim", r.url)}`, 0, 0));
        if (r.published) {
          container.addChild(
            new Text(
              `  ${theme.fg("muted", `Published: ${r.published}`)}`,
              0,
              0,
            ),
          );
        }

        if (r.truncated) {
          container.addChild(
            new Text(
              `  ${theme.fg("warning", `Excerpted: ${formatSize(r.excerptBytes)} of ${formatSize(r.totalBytes)}. Full result: ${r.tempFilePath}`)}`,
              0,
              0,
            ),
          );
        }
      }
    }

    const footerItems: { label: string; value: string }[] = [];
    footerItems.push({
      label: "results",
      value: `${results.length} result(s)`,
    });
    if (hasTruncation) {
      const truncatedCount = results.filter((r) => r.truncated).length;
      footerItems.push({
        label: "excerpted",
        value: `${truncatedCount}`,
      });
    }
    if (!expanded) {
      footerItems.push({
        label: "",
        value: keyHint("app.tools.expand", "to expand"),
      });
    }
    container.addChild(new Text("", 0, 0));
    container.addChild(
      new ToolFooter(theme, {
        items: footerItems,
        separator: " | ",
      }),
    );

    return container;
  },
});

export function registerSyntheticWebSearchTool(pi: ExtensionAPI): void {
  pi.registerTool(syntheticWebSearchTool);
}
