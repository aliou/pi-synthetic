import { describe, expect, it } from "vitest";
import {
  SearchOutputSchema,
  SYNTHETIC_WEB_SEARCH_TOOL,
} from "../../src/web-search";
import { syntheticWebSearchTool } from "./tool";

describe("syntheticWebSearchTool contract", () => {
  it("declares the structured output schema for codemode callers", () => {
    expect(syntheticWebSearchTool.name).toBe(SYNTHETIC_WEB_SEARCH_TOOL);
    expect(syntheticWebSearchTool.outputSchema).toBe(SearchOutputSchema);
  });

  it("annotates the tool as read-only and open-world", () => {
    expect(syntheticWebSearchTool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
    });
  });
});
