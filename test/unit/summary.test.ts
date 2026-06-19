import { describe, it, expect, vi } from "vitest";
import { parseSummary, summarizeConversation } from "../../src/summary.ts";

describe("parseSummary", () => {
  it("parses a clean JSON reply", () => {
    expect(parseSummary('{"title":"Loved the world","summary":"Discussed John 3:16."}')).toEqual({
      title: "Loved the world",
      summary: "Discussed John 3:16.",
    });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const reply = 'Sure!\n```json\n{"title":"Psalm 23","summary":"Walked through Psalm 23."}\n```';
    expect(parseSummary(reply)).toEqual({
      title: "Psalm 23",
      summary: "Walked through Psalm 23.",
    });
  });

  it("returns empty fields for unparseable replies", () => {
    expect(parseSummary("no json here")).toEqual({ title: "", summary: "" });
    expect(parseSummary("{broken")).toEqual({ title: "", summary: "" });
  });
});

describe("summarizeConversation", () => {
  it("sends a non-streaming completion and returns the parsed summary", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '{"title":"John 3","summary":"On John 3:16."}' } },
        ],
      }),
    })) as unknown as typeof fetch;

    const out = await summarizeConversation(
      [
        { role: "user", content: "Tell me about John 3:16" },
        { role: "assistant", content: "For God so loved the world…" },
      ],
      { apiKey: "k", model: "m", fetchImpl, lang: "en" },
    );
    expect(out).toEqual({ title: "John 3", summary: "On John 3:16." });

    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
    expect(body.stream).toBe(false);
    expect(body.messages[1].content).toContain("John 3:16");
  });

  it("throws on a failed request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "oops",
    })) as unknown as typeof fetch;

    await expect(
      summarizeConversation([{ role: "user", content: "hi" }], {
        apiKey: "k",
        model: "m",
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
