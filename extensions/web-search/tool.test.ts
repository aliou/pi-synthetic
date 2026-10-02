import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import {
  formatWebSearchResults,
  MAX_STRUCTURED_SEARCH_BYTES,
  SearchOutputSchema,
  syntheticWebSearchTool,
} from "./tool";

function result(title: string, text: string) {
  return {
    title,
    text,
    url: `https://example.com/${title}`,
    published: "2026-04-03",
  };
}

const kilobyte = "x".repeat(1024);

describe("formatWebSearchResults", () => {
  it("shares the total inline budget equally between every result", async () => {
    const writeResultFile = vi.fn(async () => {});
    const results = Array.from({ length: 4 }, (_, index) =>
      result(`result-${index}`, "a long enough line\n".repeat(20)),
    );

    const formatted = await formatWebSearchResults(results, {
      maxInlineBytes: 200,
      maxInlineBytesPerResult: 100,
      writeResultFile,
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
    expect(writeResultFile).toHaveBeenCalledTimes(4);
  });

  it("includes a bounded excerpt and a full-content link when truncating", async () => {
    const writeResultFile = vi.fn(async () => {});
    const formatted = await formatWebSearchResults(
      [result("large", "visible excerpt\n".repeat(20))],
      {
        maxInlineBytes: 50,
        maxInlineBytesPerResult: 50,
        writeResultFile,
      },
    );

    expect(formatted.content).toContain("visible excerpt");
    expect(formatted.content).toContain("Full result saved to:");
    expect(formatted.resultDetails[0]).toMatchObject({
      truncated: true,
      excerptBytes: expect.any(Number),
      tempFilePath: expect.stringContaining("pi-synthetic-search-large-"),
    });
    expect(writeResultFile).toHaveBeenCalledWith(
      expect.stringContaining("pi-synthetic-search-large-"),
      "visible excerpt\n".repeat(20),
      "utf8",
    );
  });

  it("keeps small results inline without writing temp files", async () => {
    const writeResultFile = vi.fn(async () => {});
    const formatted = await formatWebSearchResults(
      [result("one", "first"), result("two", "second")],
      {
        maxInlineBytes: 100,
        maxInlineBytesPerResult: 100,
        writeResultFile,
      },
    );

    expect(formatted.content).toContain("first");
    expect(formatted.content).toContain("second");
    expect(formatted.resultDetails.every((item) => !item.truncated)).toBe(true);
    expect(writeResultFile).not.toHaveBeenCalled();
  });

  it("handles no results without allocating a per-result budget", async () => {
    const writeResultFile = vi.fn(async () => {});
    const formatted = await formatWebSearchResults([], { writeResultFile });

    expect(formatted).toMatchObject({
      content: "Found 0 result(s):\n\n",
      resultDetails: [],
      structuredResults: [],
      maxBytesPerResult: 0,
      maxStructuredBytesPerResult: 0,
    });
    expect(writeResultFile).not.toHaveBeenCalled();
  });

  it("uses a byte-safe excerpt for a single-line result", async () => {
    const writeResultFile = vi.fn(async () => {});
    const character = "\u{1f600}";
    const text = character.repeat(30);
    const formatted = await formatWebSearchResults(
      [result("long-line", text)],
      {
        maxInlineBytes: 50,
        maxInlineBytesPerResult: 50,
        writeResultFile,
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
    expect(writeResultFile).toHaveBeenCalledWith(
      expect.any(String),
      text,
      "utf8",
    );
  });

  it("carries full result bodies in the structured output beyond the inline budget", async () => {
    // 16KB body over the 4KB default inline per-result budget.
    const body = `${kilobyte.repeat(16)}\n`;
    const formatted = await formatWebSearchResults([result("large", body)], {
      writeResultFile: vi.fn(async () => {}),
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
      { writeResultFile: vi.fn(async () => {}) },
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
        writeResultFile: vi.fn(async () => {}),
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
      writeResultFile: vi.fn(async () => {}),
    });

    const structured = formatted.structuredResults[0];
    expect(structured.text).toBe(emoji.repeat(2048));
    expect(structured.truncated).toBe(true);
    expect(Buffer.from(structured.text, "utf8").toString("utf8")).toBe(
      structured.text,
    );
  });
});

describe("syntheticWebSearchTool contract", () => {
  it("declares the structured output schema for codemode callers", () => {
    expect(syntheticWebSearchTool.name).toBe("synthetic_web_search");
    expect(syntheticWebSearchTool.outputSchema).toBe(SearchOutputSchema);
  });

  it("annotates the tool as read-only and open-world", () => {
    expect(syntheticWebSearchTool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
    });
  });
});
