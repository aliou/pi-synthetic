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
} from "../../src/client";
import { configLoader } from "../../src/config";

export const SYNTHETIC_WEB_SEARCH_TOOL = "synthetic_web_search" as const;

interface WebSearchResultDetails {
  title: string;
  url: string;
  published: string;
  truncated: boolean;
  tempFilePath?: string;
  totalLines: number;
  totalBytes: number;
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

export const syntheticWebSearchTool = defineTool({
  name: SYNTHETIC_WEB_SEARCH_TOOL,
  label: "Synthetic: Web Search",
  description: `Search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates. Use for finding documentation, articles, recent information, or any web content. Results are fresh and not cached by Synthetic. Results exceeding 1000 lines or 25KB are saved to temp files and referenced inline (use the read tool to inspect). Shorter results are included inline.`,
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

    let content = `Found ${data.results.length} result(s):\n\n`;
    const resultDetails: WebSearchResultDetails[] = [];

    for (let i = 0; i < data.results.length; i++) {
      const result = data.results[i];
      const slug = result.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40);
      const truncation = truncateHead(result.text, {
        maxLines: 1000,
        maxBytes: 25_000,
      });

      let inline: string;
      let tempFilePath: string | undefined;

      if (truncation.truncated) {
        // Result exceeds limits — write full content to a temp file
        // and only reference it inline to avoid eating LLM context
        tempFilePath = join(
          tmpdir(),
          `pi-synthetic-search-${slug}-${randomBytes(4).toString("hex")}.md`,
        );
        await writeFile(tempFilePath, result.text, "utf8");
        inline = `[Result too large: ${truncation.totalLines} lines, ${formatSize(truncation.totalBytes)}. Full result saved to: ${tempFilePath}. Use the read tool to inspect it.]`;
      } else {
        // Result fits within limits — include inline
        inline = truncation.content;
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
      });
    }

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
        text += theme.fg("warning", " (offloaded)");
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
              `  ${theme.fg("warning", `Offloaded: ${r.totalLines} lines, ${formatSize(r.totalBytes)}. Full result: ${r.tempFilePath}`)}`,
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
        label: "offloaded",
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
