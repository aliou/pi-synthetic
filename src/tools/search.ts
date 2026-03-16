import { ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

export const SYNTHETIC_WEB_SEARCH_TOOL = "synthetic_web_search" as const;

interface SyntheticSearchResult {
  url: string;
  title: string;
  text: string;
  published: string;
}

interface SyntheticSearchResponse {
  results: SyntheticSearchResult[];
}

interface WebSearchDetails {
  results?: SyntheticSearchResult[];
  query?: string;
}

const SearchParams = Type.Object({
  query: Type.String({
    description: "The search query. Be specific for best results.",
  }),
});

type SearchParamsType = Static<typeof SearchParams>;

export function registerSyntheticWebSearchTool(pi: ExtensionAPI): void {
  pi.registerTool<typeof SearchParams, WebSearchDetails>({
    name: SYNTHETIC_WEB_SEARCH_TOOL,
    label: "Synthetic: Web Search",
    description:
      "Search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates. Use for finding documentation, articles, recent information, or any web content. Results are fresh and not cached by Synthetic.",
    parameters: SearchParams,

    async execute(
      _toolCallId: string,
      params: SearchParamsType,
      signal: AbortSignal | undefined,
      onUpdate:
        | ((result: AgentToolResult<WebSearchDetails>) => void)
        | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<WebSearchDetails>> {
      onUpdate?.({
        content: [{ type: "text", text: "Searching..." }],
        details: { query: params.query },
      });

      const apiKey = process.env.SYNTHETIC_API_KEY;
      if (!apiKey) {
        throw new Error("SYNTHETIC_API_KEY is not configured");
      }

      const response = await fetch("https://api.synthetic.new/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: params.query }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search API error: ${response.status} ${errorText}`);
      }

      let data: SyntheticSearchResponse;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(
          parseError instanceof Error
            ? `Failed to parse search results: ${parseError.message}`
            : "Failed to parse search results",
        );
      }

      let content = `Found ${data.results.length} result(s):\n\n`;
      for (const result of data.results) {
        content += `## ${result.title}\n`;
        content += `URL: ${result.url}\n`;
        content += `Published: ${result.published}\n`;
        content += `\n${result.text}\n`;
        content += "\n---\n\n";
      }

      return {
        content: [{ type: "text", text: content }],
        details: {
          results: data.results,
          query: params.query,
        },
      };
    },

    renderCall(args: SearchParamsType, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Synthetic: WebSearch",
          mainArg: `"${args.query}"`,
          showColon: true,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<WebSearchDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { expanded, isPartial } = options;
      const SNIPPET_LINES = 5;

      if (isPartial) {
        return new Text(
          theme.fg("muted", "Synthetic: WebSearch: fetching..."),
          0,
          0,
        );
      }

      const details = result.details;
      const results = details?.results || [];
      const container = new Container();

      // When the tool throws, the framework calls renderResult with
      // details={} (empty object) and the error message in content.
      // Detect this by checking for missing results in details.
      if (!details?.results) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Search failed";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      if (results.length === 0) {
        container.addChild(
          new Text(theme.fg("muted", "Synthetic: WebSearch: no results"), 0, 0),
        );
      } else if (!expanded) {
        // Collapsed: show result count + first result title
        let text = theme.fg("success", `Found ${results.length} result(s)`);
        const first = results[0];
        if (first) {
          text += `\n  ${theme.fg("dim", first.title)}`;
          if (results.length > 1) {
            text += theme.fg("dim", ` (+${results.length - 1} more)`);
          }
        }
        text += theme.fg("muted", ` ${keyHint("expandTools", "to expand")}`);
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

          if (r.text) {
            container.addChild(new Text("", 0, 0));
            const snippet = r.text
              .split("\n")
              .slice(0, SNIPPET_LINES)
              .map((line) => `> ${line}`)
              .join("\n");
            container.addChild(
              new Markdown(snippet, 0, 0, getMarkdownTheme(), {
                color: (text: string) => theme.fg("toolOutput", text),
              }),
            );
          }
        }
      }

      container.addChild(new Text("", 0, 0));
      container.addChild(
        new ToolFooter(theme, {
          items: [{ label: "results", value: `${results.length} result(s)` }],
          separator: " | ",
        }),
      );

      return container;
    },
  });
}
