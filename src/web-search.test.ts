import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { SyntheticSearchResult } from "./client/types";
import {
  formatWebSearchResults,
  MAX_STRUCTURED_SEARCH_BYTES,
  SearchOutputSchema,
} from "./web-search";

function result(title: string, text: string): SyntheticSearchResult {
  return {
    title,
    text,
    url: `https://example.com/${title}`,
    published: "2026-04-03",
  };
}

const kilobyte = "x".repeat(1024);

function saveResultToTemp() {
  return vi.fn(async (_text: string, slug: string) => `/tmp/${slug}.md`);
}

describe("formatWebSearchResults", () => {
  it("shares the total inline budget equally between every result", async () => {
    const saveResult = saveResultToTemp();
    const results = Array.from({ length: 4 }, (_, index) =>
      result(`result-${index}`, "a long enough line\n".repeat(20)),
    );

    const formatted = await formatWebSearchResults(results, {
      maxInlineBytes: 200,
      maxInlineBytesPerResult: 100,
      saveResult,
    });

    expect(formatted.maxBytesPerResult).toBe(50);
    expect(formatted.resultDetails).toHaveLength(4);
    expect(formatted.resultDetails.every((item) => item.truncated)).toBe(true);
    expect(
      formatted.resultDetails.reduce(
        (total, item) => total + item.excerptBytes,
        0,
      ),
    ).toBeLessThanOrEqual(200);
    expect(saveResult).toHaveBeenCalledTimes(4);
  });

  it("includes a bounded excerpt and a full-content link when truncating", async () => {
    const saveResult = saveResultToTemp();
    const formatted = await formatWebSearchResults(
      [result("large", "visible excerpt\n".repeat(20))],
      {
        maxInlineBytes: 50,
        maxInlineBytesPerResult: 50,
        saveResult,
      },
    );

    expect(formatted.content).toContain("visible excerpt");
    expect(formatted.content).toContain("Full result saved to: /tmp/large.md");
    expect(saveResult).toHaveBeenCalledWith(
      "visible excerpt\n".repeat(20),
      "large",
    );
    expect(formatted.resultDetails[0]).toMatchObject({
      truncated: true,
      excerptBytes: expect.any(Number),
      tempFilePath: "/tmp/large.md",
    });
  });

  it("keeps small results inline without saving files", async () => {
    const saveResult = saveResultToTemp();
    const formatted = await formatWebSearchResults(
      [result("one", "first"), result("two", "second")],
      {
        maxInlineBytes: 100,
        maxInlineBytesPerResult: 100,
        saveResult,
      },
    );

    expect(formatted.content).toContain("first");
    expect(formatted.content).toContain("second");
    expect(formatted.resultDetails.every((item) => !item.truncated)).toBe(true);
    expect(saveResult).not.toHaveBeenCalled();
  });

  it("handles no results without allocating a per-result budget", async () => {
    const formatted = await formatWebSearchResults([], {
      saveResult: saveResultToTemp(),
    });

    expect(formatted).toMatchObject({
      content: "Found 0 result(s):\n\n",
      resultDetails: [],
      structuredResults: [],
      maxBytesPerResult: 0,
      maxStructuredBytesPerResult: 0,
    });
  });

  it("uses a byte-safe excerpt for a single-line result", async () => {
    const character = "\u{1f600}";
    const text = character.repeat(30);
    const formatted = await formatWebSearchResults(
      [result("long-line", text)],
      {
        maxInlineBytes: 50,
        maxInlineBytesPerResult: 50,
        saveResult: saveResultToTemp(),
      },
    );

    expect(formatted.content).toContain("Full result saved to:");
    expect(formatted.content).toContain(character.repeat(12));
    expect(formatted.content).toContain("Content truncated to 48B");
    expect(formatted.resultDetails[0]).toMatchObject({
      truncated: true,
      excerptBytes: 48,
      tempFilePath: expect.any(String),
    });
  });

  it("truncates without a full-content link when no saver is given", async () => {
    const text = "visible excerpt\n".repeat(20);
    const formatted = await formatWebSearchResults([result("large", text)], {
      maxInlineBytes: 50,
      maxInlineBytesPerResult: 50,
    });

    expect(formatted.content).toContain("Content truncated to");
    expect(formatted.content).not.toContain("Full result saved to:");
    expect(formatted.resultDetails[0]).toMatchObject({
      truncated: true,
      excerptBytes: expect.any(Number),
    });
    expect(formatted.resultDetails[0]?.tempFilePath).toBeUndefined();
    expect(formatted.structuredResults[0]?.text).toBe(text);
    expect(formatted.structuredResults[0]?.truncated).toBe(false);
    expect(formatted.structuredResults[0]?.tempFilePath).toBeUndefined();
  });

  it("carries full result bodies in the structured output beyond the inline budget", async () => {
    // 16KB body over the 4KB default inline per-result budget.
    const body = `${kilobyte.repeat(16)}\n`;
    const formatted = await formatWebSearchResults([result("large", body)], {
      saveResult: saveResultToTemp(),
    });

    expect(formatted.maxStructuredBytesPerResult).toBe(
      MAX_STRUCTURED_SEARCH_BYTES,
    );
    expect(formatted.resultDetails[0]?.truncated).toBe(true);
    expect(formatted.structuredResults).toHaveLength(1);
    const structured = formatted.structuredResults[0];
    expect(structured.text).toBe(body);
    expect(structured.truncated).toBe(false);
    expect(structured.tempFilePath).toBe(
      formatted.resultDetails[0]?.tempFilePath,
    );
  });

  it("validates the structured output against SearchOutputSchema", async () => {
    const formatted = await formatWebSearchResults(
      [result("one", kilobyte.repeat(2)), result("two", "short body")],
      { saveResult: saveResultToTemp() },
    );

    const payload = {
      query: "pi 1.0.0 structured output",
      results: formatted.structuredResults,
    };

    expect([...Value.Errors(SearchOutputSchema, payload)]).toEqual([]);
    expect(Value.Check(SearchOutputSchema, payload)).toBe(true);
    // No undefined-valued keys smuggled into the JSON payload.
    expect(JSON.stringify(payload)).not.toContain("undefined");
  });

  it("caps structured text at the shared budget and marks truncation", async () => {
    const body = kilobyte.repeat(8);
    const formatted = await formatWebSearchResults(
      [result("a", body), result("b", body)],
      {
        maxInlineBytes: 200,
        maxInlineBytesPerResult: 100,
        maxStructuredBytes: 4096,
        saveResult: saveResultToTemp(),
      },
    );

    expect(formatted.maxStructuredBytesPerResult).toBe(2048);
    for (const structured of formatted.structuredResults) {
      expect(Buffer.byteLength(structured.text)).toBe(2048);
      expect(structured.truncated).toBe(true);
      expect(structured.tempFilePath).toBeTruthy();
    }
  });

  it("keeps the structured text UTF-8 safe at multi-byte boundaries", async () => {
    const emoji = "\u{1f600}"; // 4 bytes per emoji
    const text = emoji.repeat(4096); // 16KB
    const formatted = await formatWebSearchResults([result("emoji", text)], {
      maxInlineBytes: 100,
      maxInlineBytesPerResult: 100,
      // 8194 does not end at an emoji boundary; the cut must land at 8192.
      maxStructuredBytes: 8194,
      saveResult: saveResultToTemp(),
    });

    const structured = formatted.structuredResults[0];
    expect(structured.text).toBe(emoji.repeat(2048));
    expect(structured.truncated).toBe(true);
    expect(Buffer.from(structured.text, "utf8").toString("utf8")).toBe(
      structured.text,
    );
  });
});
