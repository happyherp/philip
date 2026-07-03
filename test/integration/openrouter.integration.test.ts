import { describe, it, expect } from "vitest";
import { runChat, type ChatUsage } from "../../src/openrouter.ts";
import { fileAssetFetch } from "../helpers.ts";

// Opt-in: only runs with RUN_INTEGRATION=1 and a real OPENROUTER_API_KEY.
const ENABLED = process.env.RUN_INTEGRATION === "1" && !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-latest";

describe.skipIf(!ENABLED)("OpenRouter (live)", () => {
  it("streams tokens for a simple turn", async () => {
    const tokens: string[] = [];
    const result = await runChat(
      [{ role: "user", content: "Reply with a single short word." }],
      {
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: MODEL,
        assetFetch: fileAssetFetch(),
        onToken: (t) => {
          tokens.push(t);
        },
      },
    );
    expect(result.text.length).toBeGreaterThan(0);
    expect(tokens.length).toBeGreaterThan(0);
  }, 60_000);

  it("enables prompt caching (cache_write or cache_read tokens reported)", async () => {
    // Make two identical requests back-to-back. The first should trigger a
    // cache write; the second should hit the cache. We verify that at least
    // one of the two reports cache-related usage tokens.
    const sharedHistory = [
      { role: "user" as const, content: "Reply with the single word 'hello'." },
    ];

    const results: ChatUsage[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await runChat(sharedHistory, {
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: MODEL,
        assetFetch: fileAssetFetch(),
        onToken: () => {},
      });
      results.push(r.usage);
    }

    const hasWrite = results.some((u) => (u.cache_write_tokens ?? 0) > 0);
    const hasRead = results.some((u) => (u.cache_read_tokens ?? 0) > 0);
    // At least one request should report cache activity.
    expect(hasWrite || hasRead).toBe(true);
  }, 90_000);
});
