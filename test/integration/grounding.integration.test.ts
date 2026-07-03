import { describe, it, expect } from "vitest";
import { runChat } from "../../src/openrouter.ts";
import { getPassage } from "../../src/bible.ts";
import { fileAssetFetch } from "../helpers.ts";

// The key correctness guarantee: when Philip quotes scripture, it is the EXACT
// bundled WEB text obtained via the get_passage tool — never hallucinated.
const ENABLED = process.env.RUN_INTEGRATION === "1" && !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "~anthropic/claude-sonnet-latest";

describe.skipIf(!ENABLED)("grounding (live)", () => {
  it("calls get_passage and the tool result contains exact WEB text", async () => {
    const assets = fileAssetFetch();

    // Verify the bundled fixture has the expected WEB text (not NKJV "abide").
    const passage = await getPassage("John 8:31", assets);
    if (!("verses" in passage)) throw new Error("fixture lookup failed");
    expect(passage.verses[0].text).toContain("If you remain in my word");

    let toolCalled = false;
    let toolResult = "";
    const assetsSpy = async (path: string) => {
      if (path.includes("/bible/web/")) toolCalled = true;
      const res = await assets(path);
      // Clone so we can inspect the body without consuming it for the caller.
      const clone = res.clone();
      toolResult = await clone.text();
      return res;
    };

    let answer = "";
    await runChat(
      [{ role: "user", content: "Let's read John 8:31 together. Show me the verse." }],
      {
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: MODEL,
        assetFetch: assetsSpy,
        onToken: (t) => {
          answer += t;
        },
      },
    );

    // Core guarantee: the tool was called (model can't write from memory).
    expect(toolCalled).toBe(true);

    // The bundled asset that was served to the model contained exact WEB text.
    // This is the grounding contract — the model receives the right source material.
    expect(toolResult).toContain("If you remain in my word");

    // Model produced a non-trivial response about the passage.
    expect(answer.length).toBeGreaterThan(40);
    // Model's response should reference the core concept, even if paraphrased.
    expect(answer.toLowerCase()).toMatch(/remain|disciple|word|truth|free/);

    // New grounding contract: scripture is displayed via a quote marker…
    expect(answer).toMatch(/\{\{(quote|q)\s+John 8:[\d:–-]+\s*(@[a-z0-9]+)?\s*\}\}/);
    // …and the model does not retype the verse text itself.
    expect(answer).not.toContain("If you remain in my word");
  }, 90_000);
});
