import { describe, expect, it, vi } from "vitest";
import { formatWebSearchResults } from "./tool";

function result(title: string, text: string) {
  return {
    title,
    text,
    url: `https://example.com/${title}`,
    published: "2026-04-03",
  };
}

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
      maxBytesPerResult: 0,
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
});
