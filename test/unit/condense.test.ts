import { describe, it, expect, vi } from "vitest";
import {
  estimateTokens,
  extractQuoteReferences,
  shouldCondense,
  buildCondensePrompt,
  condenseHistory,
} from "../../src/condense.ts";
import type { ConversationMessage } from "../../src/messages.ts";

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------
describe("estimateTokens", () => {
  it("returns roughly chars / 4", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "Hello world" }, // 11 chars
      { role: "assistant", content: "Hi there!" }, // 9 chars
    ];
    // 20 chars / 4 = 5
    expect(estimateTokens(msgs)).toBe(5);
  });

  it("returns 0 for empty input", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("rounds up", () => {
    const msgs: ConversationMessage[] = [{ role: "user", content: "abc" }]; // 3 / 4 → ceil = 1
    expect(estimateTokens(msgs)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// extractQuoteReferences
// ---------------------------------------------------------------------------
describe("extractQuoteReferences", () => {
  it("extracts references from {{quote}}, {{q}}, and {{ref}} markers", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "Tell me about John" },
      {
        role: "assistant",
        content:
          '{{quote John 1:1-5 @web}}\n\nNotice the opening. See also {{ref Genesis 1:1 @web}} and {{q John 1:3 @web "all things"}}.',
      },
    ];
    expect(extractQuoteReferences(msgs)).toEqual([
      "John 1:1-5",
      "Genesis 1:1",
      "John 1:3",
    ]);
  });

  it("deduplicates references", () => {
    const msgs: ConversationMessage[] = [
      {
        role: "assistant",
        content: "{{quote John 3:16 @web}}\n\n{{q John 3:16 @web}}",
      },
    ];
    expect(extractQuoteReferences(msgs)).toEqual(["John 3:16"]);
  });

  it("ignores user messages", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "{{quote John 1:1 @web}}" },
    ];
    expect(extractQuoteReferences(msgs)).toEqual([]);
  });

  it("returns empty for no markers", () => {
    const msgs: ConversationMessage[] = [
      { role: "assistant", content: "No quotes here." },
    ];
    expect(extractQuoteReferences(msgs)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shouldCondense
// ---------------------------------------------------------------------------
describe("shouldCondense", () => {
  it("returns false when under token threshold", () => {
    expect(shouldCondense(5000, Date.now() - 600_000, 8000, 300_000)).toBe(false);
  });

  it("returns false when cache is warm (recent request)", () => {
    expect(shouldCondense(10_000, Date.now() - 60_000, 8000, 300_000)).toBe(false);
  });

  it("returns true when over threshold AND cache expired", () => {
    expect(shouldCondense(10_000, Date.now() - 600_000, 8000, 300_000)).toBe(true);
  });

  it("returns true when lastRequestAt is 0 (never) and over threshold", () => {
    expect(shouldCondense(10_000, 0, 8000, 300_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCondensePrompt
// ---------------------------------------------------------------------------
describe("buildCondensePrompt", () => {
  it("mentions English for lang=en", () => {
    expect(buildCondensePrompt("en")).toContain("English");
  });

  it("mentions Spanish for lang=es", () => {
    expect(buildCondensePrompt("es")).toContain("Spanish");
  });

  it("mentions German for lang=de", () => {
    expect(buildCondensePrompt("de")).toContain("German");
  });

  it("defaults to English for unknown lang", () => {
    expect(buildCondensePrompt("fr")).toContain("English");
  });

  it("instructs preservation of user facts", () => {
    const prompt = buildCondensePrompt("en");
    expect(prompt).toContain("user told you about themselves");
  });
});

// ---------------------------------------------------------------------------
// condenseHistory
// ---------------------------------------------------------------------------
describe("condenseHistory", () => {
  const CANNED_SUMMARY = [
    "USER FACTS:",
    "- Name: Carlos",
    "- From Belize",
    "",
    "READING PROGRESS:",
    "- Reading John, paused at 8:47",
    "",
    "KEY POINTS:",
    "- Interested in word studies",
  ].join("\n");

  it("calls the cheap model and returns a summary with appended verse list", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: CANNED_SUMMARY } }],
      }),
    })) as unknown as typeof fetch;

    const messages: ConversationMessage[] = [
      { role: "user", content: "My name is Carlos, I'm from Belize." },
      { role: "assistant", content: "{{quote John 1:1-5 @web}}\n\nWelcome, Carlos." },
      { role: "user", content: "go on" },
      { role: "assistant", content: "{{quote John 1:6-9 @web}}\n\nThe light shines." },
    ];

    const result = await condenseHistory(messages, {
      apiKey: "test-key",
      model: "anthropic/claude-haiku-4.5",
      fetchImpl,
      lang: "en",
    });

    // Should contain the LLM summary + programmatic verse list
    expect(result.summary).toContain("USER FACTS:");
    expect(result.summary).toContain("Carlos");
    expect(result.summary).toContain("VERSES DISCUSSED: John 1:1-5, John 1:6-9");

    // Verify it sent a non-streaming request
    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
    expect(body.stream).toBe(false);
    expect(body.model).toBe("anthropic/claude-haiku-4.5");
  });

  it("strips {{quote}} markers from the transcript sent to the summariser", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "KEY POINTS:\n- discussed logos" } }],
      }),
    })) as unknown as typeof fetch;

    const messages: ConversationMessage[] = [
      { role: "assistant", content: "{{quote John 1:1-5 @web}}\n\nThe logos concept." },
    ];

    await condenseHistory(messages, {
      apiKey: "k",
      model: "m",
      fetchImpl,
      lang: "en",
    });

    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
    const transcript = body.messages[1].content;
    expect(transcript).not.toContain("{{quote");
    expect(transcript).toContain("The logos concept");
  });

  it("throws on a failed request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "server error",
    })) as unknown as typeof fetch;

    await expect(
      condenseHistory(
        [{ role: "user", content: "hi" }],
        { apiKey: "k", model: "m", fetchImpl },
      ),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("omits VERSES DISCUSSED when there are no quote markers", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "KEY POINTS:\n- general chat" } }],
      }),
    })) as unknown as typeof fetch;

    const result = await condenseHistory(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "welcome!" },
      ],
      { apiKey: "k", model: "m", fetchImpl },
    );

    expect(result.summary).not.toContain("VERSES DISCUSSED");
  });
});
