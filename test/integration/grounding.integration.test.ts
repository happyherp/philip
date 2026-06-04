import { describe, it, expect } from "vitest";
import { runChat } from "../../src/openrouter.ts";
import { getPassage } from "../../src/bible.ts";
import { fileAssetFetch } from "../helpers.ts";

// The key correctness guarantee: when Philip quotes scripture, it is the EXACT
// bundled WEB text obtained via the get_passage tool — never hallucinated.
const ENABLED = process.env.RUN_INTEGRATION === "1" && !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

describe.skipIf(!ENABLED)("grounding (live)", () => {
  it("quotes the exact bundled WEB text for John 8:31", async () => {
    const assets = fileAssetFetch();

    // The ground truth we expect to see surfaced.
    const passage = await getPassage("John 8:31", assets);
    if (!("verses" in passage)) throw new Error("fixture lookup failed");
    const truth = passage.verses[0].text;
    // A distinctive fragment that a hallucination (e.g. NKJV "abide") would miss.
    expect(truth).toContain("If you remain in my word");

    let toolCalled = false;
    const assetsSpy = (path: string) => {
      if (path.includes("/bible/web/")) toolCalled = true;
      return assets(path);
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

    expect(toolCalled).toBe(true);
    // The distinctive WEB phrasing must appear verbatim in Philip's answer.
    expect(answer).toContain("remain in my word");
  }, 90_000);
});
