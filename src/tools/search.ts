import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

// Types
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
  error?: string;
  isError?: boolean;
}

// Schema
const SearchParams = Type.Object({
  query: Type.String({
    description: "The search query. Be specific for best results.",
  }),
});

type SearchParamsType = Static<typeof SearchParams>;

// Check if API key has subscription access by calling usage endpoint
// Subscription keys have content in the response, usage-based keys return empty array
async function hasSubscriptionAccess(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.synthetic.new/v2/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    // Subscription keys have content in the response array
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

// Tool Registration
export async function registerSyntheticWebSearchTool(pi: ExtensionAPI) {
  // Check for API key
  const apiKey = process.env.SYNTHETIC_API_KEY;
  if (!apiKey) {
    return;
  }

  // Only register if user has subscription access (search is subscription-only)
  const hasAccess = await hasSubscriptionAccess(apiKey);
  if (!hasAccess) {
    return;
  }

  pi.registerTool<typeof SearchParams, WebSearchDetails>({
    name: "synthetic_web_search",
    label: "Synthetic: Web Search",
    description:
      "Search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates. Use for finding documentation, articles, recent information, or any web content. Results are fresh and not cached by Synthetic.",
    parameters: SearchParams,

    async execute(
      _toolCallId: string,
      params: SearchParamsType,
      onUpdate: (result: AgentToolResult<WebSearchDetails>) => void,
      _ctx: ExtensionContext,
      signal?: AbortSignal,
    ): Promise<AgentToolResult<WebSearchDetails>> {
      // Check for API key
      const apiKey = process.env.SYNTHETIC_API_KEY;
      if (!apiKey) {
        const error = "SYNTHETIC_API_KEY environment variable is required";
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          details: { error, isError: true },
        };
      }

      // Send progress update
      onUpdate({
        content: [{ type: "text", text: "Searching..." }],
        details: { query: params.query },
      });

      try {
        // Make API request
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
          const error = `Search API error: ${response.status} ${errorText}`;
          return {
            content: [{ type: "text", text: `Error: ${error}` }],
            details: { error, isError: true },
          };
        }

        // Parse response
        let data: SyntheticSearchResponse;
        try {
          data = await response.json();
        } catch (parseError) {
          const error =
            parseError instanceof Error
              ? `Failed to parse search results: ${parseError.message}`
              : "Failed to parse search results";
          return {
            content: [{ type: "text", text: `Error: ${error}` }],
            details: { error, isError: true },
          };
        }

        // Format results for LLM
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
      } catch (error) {
        // Handle abort signal
        if (error instanceof Error && error.name === "AbortError") {
          return {
            content: [{ type: "text", text: "Search cancelled" }],
            details: { query: params.query },
          };
        }

        // Handle other errors
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { error: message, isError: true },
        };
      }
    },

    renderCall(args: SearchParamsType, theme: Theme): Text {
      let text = theme.fg("toolTitle", theme.bold("Synthetic: WebSearch "));
      text += theme.fg("accent", `"${args.query}"`);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<WebSearchDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ): Text {
      const { expanded, isPartial } = options;

      // Handle partial/loading state
      if (isPartial) {
        const text =
          result.content?.[0]?.type === "text"
            ? result.content[0].text
            : "Searching...";
        return new Text(theme.fg("dim", text), 0, 0);
      }

      const details = result.details;

      // Handle error state
      if (details?.isError) {
        const errorMsg =
          result.content?.[0]?.type === "text"
            ? result.content[0].text
            : "Error occurred";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      // Handle success state
      const results = details?.results || [];
      let text = theme.fg("success", `✓ Found ${results.length} result(s)`);

      // Collapsed view
      if (!expanded && results.length > 0) {
        const first = results[0];
        text += `\n  ${theme.fg("dim", `${first.title}`)}`;
        if (results.length > 1) {
          text += theme.fg("dim", ` (${results.length - 1} more)`);
        }
        text += theme.fg("muted", ` [Ctrl+O to expand]`);
      }

      // Expanded view
      if (expanded) {
        for (const r of results) {
          text += `\n\n${theme.fg("accent", theme.bold(r.title))}`;
          text += `\n${theme.fg("dim", r.url)}`;
          if (r.text) {
            const preview = r.text.slice(0, 200);
            text += `\n${theme.fg("muted", preview)}`;
            if (r.text.length > 200) {
              text += theme.fg("dim", "...");
            }
          }
        }
      }

      return new Text(text, 0, 0);
    },
  });
}
