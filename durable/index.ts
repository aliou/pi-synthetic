import type { Context } from "@earendil-works/chord";
import {
  defineExtension,
  defineTool,
  type ExecutionEnv,
  type Extension,
} from "@earendil-works/pi-durable";
import {
  resolveSyntheticClientOptions,
  SyntheticClient,
  type SyntheticSearchResponse,
  type SyntheticUtilityApiConfig,
} from "../src/client";
import { SYNTHETIC_PROVIDER_ID } from "../src/constants";
import {
  formatWebSearchResults,
  type SaveSearchResultFile,
  type SearchOutput,
  SearchOutputSchema,
  SearchParams,
  SYNTHETIC_WEB_SEARCH_TOOL,
  type WebSearchResultDetails,
} from "../src/web-search";

export const SYNTHETIC_EXTENSION_NAME = "@aliou/pi-synthetic" as const;

export interface SyntheticDurableOptions {
  /** Key used when the host's Models has no configured synthetic provider. */
  apiKey?: string;
  /** Overrides the Synthetic quotas and web search API root. */
  proxyUrl?: string;
  /** When disabled with a proxy, search skips the API key check. */
  proxyRequiresAuth?: boolean;
}

function createEnvSaveResult(
  env: ExecutionEnv | undefined,
  context: Context,
): SaveSearchResultFile | undefined {
  if (!env) return undefined;
  return async (text, slug) => {
    const temp = await env.createTempFile(
      { prefix: `synthetic-web-search-${slug}-`, suffix: ".md" },
      context,
    );
    if (!temp.ok) return undefined;
    const written = await env.writeFile(temp.value, text, context);
    return written.ok ? temp.value : undefined;
  };
}

function createWebSearchTool(options?: SyntheticDurableOptions) {
  return defineTool({
    name: SYNTHETIC_WEB_SEARCH_TOOL,
    description:
      "Search the web using Synthetic's zero-data-retention API. Returns search results with titles, URLs, content snippets, and publication dates. Use for finding documentation, articles, recent information, or any web content. Results are fresh and not cached by Synthetic. Body excerpts share a 20KB budget, with an equal 4KB maximum per result. Larger results include a bounded excerpt; when the host provides a file environment, the full body is saved to a temp file named in the result.",
    parameters: SearchParams,
    structuredOutputSchema: SearchOutputSchema,
    replay: "safe",

    async execute(args, api, context) {
      api.output("Searching...\n");

      const config: SyntheticUtilityApiConfig = {
        proxyUrl: options?.proxyUrl,
        proxyRequiresAuth: options?.proxyRequiresAuth,
      };
      const auth = await api.models.getAuth(SYNTHETIC_PROVIDER_ID);
      const clientOptions = await resolveSyntheticClientOptions(
        config,
        async () => options?.apiKey ?? auth?.auth.apiKey,
      );
      if (!clientOptions) {
        throw new Error(
          "Synthetic web search requires a Synthetic subscription or an unauthenticated proxy. Configure a synthetic provider credential in the host's Models, pass the apiKey option, or set proxyUrl with proxyRequiresAuth: false.",
        );
      }

      let data: SyntheticSearchResponse;
      try {
        const client = new SyntheticClient(clientOptions);
        data = await client.search(args.query, {
          signal: context.abortSignal ?? undefined,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Search failed";
        throw new Error(`Synthetic web search: ${message}`);
      }

      const { content, resultDetails, structuredResults } =
        await formatWebSearchResults(data.results, {
          saveResult: createEnvSaveResult(api.env, context),
        });
      const structuredOutput: SearchOutput = {
        query: args.query,
        results: structuredResults,
      };

      return {
        output: [{ type: "text" as const, text: content }],
        details: {
          results: resultDetails,
          query: args.query,
        } satisfies { results: WebSearchResultDetails[]; query: string },
        structuredOutput,
      };
    },
  });
}

export function createSyntheticExtension(
  options?: SyntheticDurableOptions,
): Extension {
  return defineExtension({
    name: SYNTHETIC_EXTENSION_NAME,
    tools: [createWebSearchTool(options)],
  });
}

export default createSyntheticExtension;
