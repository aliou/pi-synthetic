import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { Static } from "typebox";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
  type SyntheticSearchResponse,
} from "../../src/client";
import {
  formatSize,
  formatWebSearchResults,
  type SearchOutput,
  SearchOutputSchema,
  SearchParams,
  SYNTHETIC_WEB_SEARCH_TOOL,
  type WebSearchResultDetails,
} from "../../src/web-search";
import { configLoader } from "../_shared/config/loader";

interface WebSearchDetails {
  results?: WebSearchResultDetails[];
  query?: string;
}

type SearchParamsType = Static<typeof SearchParams>;

async function saveResultFile(text: string, slug: string): Promise<string> {
  const path = join(
    tmpdir(),
    `pi-synthetic-search-${slug}-${randomBytes(4).toString("hex")}.md`,
  );
  await writeFile(path, text, "utf8");
  return path;
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
  outputSchema: SearchOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },

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

    const { content, resultDetails, structuredResults } =
      await formatWebSearchResults(data.results, {
        saveResult: saveResultFile,
      });
    const structuredContent: SearchOutput = {
      query: params.query,
      results: structuredResults,
    };

    return {
      content: [{ type: "text", text: content }],
      details: {
        results: resultDetails,
        query: params.query,
      },
      structuredContent,
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
      text += theme.fg(
        "muted",
        ` ${context.keyHint("app.tools.expand", "to expand")}`,
      );
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
        value: context.keyHint("app.tools.expand", "to expand"),
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
