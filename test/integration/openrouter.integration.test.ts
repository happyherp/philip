import { describe, it, expect } from "vitest";
import { runChat } from "../../src/openrouter.ts";
import { fileAssetFetch } from "../helpers.ts";

// Opt-in: only runs with RUN_INTEGRATION=1 and a real OPENROUTER_API_KEY.
const ENABLED = process.env.RUN_INTEGRATION === "1" && !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

describe.skipIf(!ENABLED)("OpenRouter (live)", () => {
  it("streams tokens for a simple turn", async () => {
    const tokens: string[] = [];
    const final = await runChat(
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
    expect(final.length).toBeGreaterThan(0);
    expect(tokens.length).toBeGreaterThan(0);
  }, 60_000);
});
