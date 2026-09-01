// Unit tests for the developer-run eval suite (eval/) — the offline parts:
// matrix expansion, the promise pool, retry classification, cost accounting
// and report generation. No network.

import { describe, expect, it } from "vitest";
import { InsufficientCreditsError } from "../../src/openrouter.ts";
import { EXPERIMENTS, PROMPT_VARIANTS, BASE_SELECTION } from "../../eval/config.ts";
import { instrumentedFetch, lookupPricing, summarizeCost, type PricingTable, type RoundUsage } from "../../eval/cost.ts";
import { isTransientError, runPool, withRetry } from "../../eval/pool.ts";
import { buildCliSummary, buildHtmlReport } from "../../eval/report.ts";
import { expandMatrix } from "../../eval/run.ts";
import { SCENARIOS, scenarioById } from "../../eval/scenarios.ts";
import type { AxisSelection, Manifest, RunRecord } from "../../eval/types.ts";
import { sseResponse } from "../helpers.ts";

// --- config & scenarios -------------------------------------------------------

describe("eval config", () => {
  it("every experiment references only existing scenarios and prompt variants", () => {
    for (const [name, exp] of Object.entries(EXPERIMENTS)) {
      for (const id of exp.scenarios ?? []) {
        expect(scenarioById(id), `experiment ${name}: scenario ${id}`).toBeDefined();
      }
      for (const p of exp.prompts ?? []) {
        expect(PROMPT_VARIANTS[p], `experiment ${name}: prompt ${p}`).toBeDefined();
      }
    }
  });

  it("prompt variants react to lang and search flags", () => {
    const base = PROMPT_VARIANTS.base;
    expect(base("en", false)).toContain("English");
    expect(base("de", false)).toContain("Deutsch");
    expect(base("en", true)).toContain("search_scripture");
    expect(base("en", false)).not.toContain("search_scripture");
  });

  it("scenario ids are unique and language restrictions are valid", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) {
      expect(s.turns.length).toBeGreaterThan(0);
      for (const lang of s.langs ?? []) expect(["en", "es", "de"]).toContain(lang);
    }
  });
});

describe("expandMatrix", () => {
  const sel: AxisSelection = {
    ...BASE_SELECTION,
    models: ["m1", "m2"],
    prompts: ["base"],
    langs: ["en", "es"],
    scenarios: ["read-john-3", "spanish-psalm"],
    search: [false, true],
    repeat: 2,
  };

  it("skips scenario/lang combos the scenario does not support", () => {
    const specs = expandMatrix(sel);
    // read-john-3 is en-only, spanish-psalm is es-only → 1 lang each.
    // 2 scenarios × 1 lang × 2 models × 1 prompt × 2 search × 2 repeats = 16
    expect(specs).toHaveLength(16);
    expect(specs.every((s) => (s.scenarioId === "read-john-3" ? s.lang === "en" : s.lang === "es"))).toBe(true);
  });

  it("produces unique run ids", () => {
    const specs = expandMatrix(sel);
    expect(new Set(specs.map((s) => s.runId)).size).toBe(specs.length);
  });
});

// --- pool ---------------------------------------------------------------------

describe("runPool", () => {
  it("respects the concurrency limit and keeps item order", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("stops starting new work when shouldStop flips", async () => {
    let ran = 0;
    let stop = false;
    const results = await runPool(
      [1, 2, 3, 4, 5, 6, 7, 8],
      1,
      async (n) => {
        ran++;
        if (n === 2) stop = true;
        return n;
      },
      () => stop,
    );
    expect(ran).toBe(2);
    expect(results).toEqual([1, 2]);
  });
});

describe("withRetry / isTransientError", () => {
  it("retries transient failures and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("OpenRouter request failed: HTTP 429 slow down");
        return "ok";
      },
      { retries: 3, baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry non-transient errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("OpenRouter request failed: HTTP 400 bad request");
        },
        { retries: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("HTTP 400");
    expect(calls).toBe(1);
  });

  it("classifies errors", () => {
    expect(isTransientError(new Error("OpenRouter request failed: HTTP 429"))).toBe(true);
    expect(isTransientError(new Error("OpenRouter request failed: HTTP 503"))).toBe(true);
    expect(isTransientError(new Error("OpenRouter request timed out after 30s"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("OpenRouter request failed: HTTP 400"))).toBe(false);
    expect(isTransientError(new InsufficientCreditsError("no credits"))).toBe(false);
  });
});

// --- cost -----------------------------------------------------------------------

const usageChunk = (usage: Record<string, unknown>) =>
  `data: ${JSON.stringify({ choices: [{ delta: {} }], usage })}\n\n`;

describe("instrumentedFetch", () => {
  it("injects usage accounting into chat requests and records each round", async () => {
    const bodies: any[] = [];
    const base = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sseResponse([
        usageChunk({
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          cost: 0.001,
          prompt_tokens_details: { cached_tokens: 40 },
        }),
        "data: [DONE]\n\n",
      ]);
    }) as typeof fetch;

    const meter = instrumentedFetch(base);
    const res = await meter.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "m", messages: [] }),
    });
    // The caller can still consume the stream fully.
    await res.text();

    expect(bodies[0].usage).toEqual({ include: true });
    const rounds = await meter.drain();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      promptTokens: 100,
      completionTokens: 20,
      cacheReadTokens: 40,
      costUsd: 0.001,
    });
  });

  it("passes non-chat requests through untouched", async () => {
    let sawBody: unknown = "untouched";
    const base = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sawBody = init?.body;
      return new Response("{}");
    }) as typeof fetch;
    const meter = instrumentedFetch(base);
    await meter.fetchImpl("https://example.com/search?query=x");
    expect(sawBody).toBeUndefined();
    expect(await meter.drain()).toHaveLength(0);
  });
});

describe("summarizeCost", () => {
  const pricing: PricingTable = new Map([["anthropic/claude-sonnet-latest", { prompt: 0.000003, completion: 0.000015 }]]);
  const round = (over: Partial<RoundUsage> = {}): RoundUsage => ({
    promptTokens: 1000,
    completionTokens: 100,
    totalTokens: 1100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...over,
  });

  it("sums rounds and uses OpenRouter-reported cost when every round has it", () => {
    const s = summarizeCost([round({ costUsd: 0.002 }), round({ costUsd: 0.003 })], pricing, "~anthropic/claude-sonnet-latest");
    expect(s.usage.promptTokens).toBe(2000);
    expect(s.usage.rounds).toBe(2);
    expect(s.costUsd).toBeCloseTo(0.005);
    expect(s.costSource).toBe("openrouter");
    // normalized: 2000 * 3e-6 + 200 * 15e-6
    expect(s.normalizedCostUsd).toBeCloseTo(0.009);
  });

  it("falls back to the pricing table when a round is missing cost", () => {
    const s = summarizeCost([round({ costUsd: 0.002 }), round()], pricing, "~anthropic/claude-sonnet-latest");
    expect(s.costSource).toBe("pricing-table");
    expect(s.costUsd).toBeCloseTo(0.009);
  });

  it("reports unavailable when there is neither reported cost nor pricing", () => {
    const s = summarizeCost([round()], new Map(), "unknown/model");
    expect(s.costUsd).toBeNull();
    expect(s.costSource).toBe("unavailable");
  });

  it("lookupPricing tolerates the ~ alias prefix", () => {
    expect(lookupPricing(pricing, "~anthropic/claude-sonnet-latest")).toBeDefined();
    expect(lookupPricing(pricing, "anthropic/claude-sonnet-latest")).toBeDefined();
    expect(lookupPricing(pricing, "other/model")).toBeUndefined();
  });
});

// --- report -----------------------------------------------------------------------

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    spec: {
      runId: "read-john-3__m__base__en__nosearch__r0",
      model: "m",
      promptName: "base",
      lang: "en",
      scenarioId: "read-john-3",
      search: false,
      repeatIndex: 0,
    },
    turns: [{ user: "Read John 3 with me.", assistant: "{{quote John 3:1-8 @web}}\n\nA <night> visit.", ms: 4200, ttftMs: 900 }],
    toolLog: [{ turn: 0, tool: "get_passage", detail: "John 3:1-8 @web" }],
    usage: { promptTokens: 1000, completionTokens: 100, totalTokens: 1100, cacheReadTokens: 0, cacheWriteTokens: 900, rounds: 2 },
    costUsd: 0.0042,
    normalizedCostUsd: 0.005,
    costSource: "openrouter",
    wallMs: 4200,
    error: null,
    startedAt: "2026-07-08T00:00:00.000Z",
    ...over,
  };
}

const manifest: Manifest = {
  createdAt: "2026-07-08T00:00:00.000Z",
  gitSha: "abcdef1234567890",
  argv: ["--experiment=quick"],
  selection: { ...BASE_SELECTION },
  specCount: 1,
};

describe("report", () => {
  it("builds an HTML report with escaped transcripts, cost and time", () => {
    const html = buildHtmlReport(manifest, [record()]);
    expect(html).toContain("$0.0042");
    expect(html).toContain("4.2s");
    // Model output is escaped, markers shown literally.
    expect(html).toContain("{{quote John 3:1-8 @web}}");
    expect(html).toContain("A &lt;night&gt; visit.");
    expect(html).not.toContain("<night>");
    // The scenario's manual-review notes are included.
    expect(html).toContain("retype verse text");
  });

  it("shows errors and renders a CLI summary", () => {
    const failed = record({ error: "OpenRouter request failed: HTTP 500", costUsd: null, costSource: "unavailable" });
    const html = buildHtmlReport(manifest, [failed]);
    expect(html).toContain("ERROR");

    const cli = buildCliSummary([record(), failed]);
    expect(cli).toContain("m · base · en · no-search");
    expect(cli).toContain("1"); // one failure
  });
});
