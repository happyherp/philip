// Cost & token accounting for eval runs.
//
// Two mechanisms, combined per run:
//  1. An instrumented fetch wrapper injected into runChat. It adds
//     `usage: {include: true}` to each OpenRouter request so the final SSE
//     chunk carries OpenRouter's own dollar cost, and it sniffs that chunk
//     from a cloned stream. This also fixes an accounting quirk in runChat:
//     runChat merges per-round usage with Object.assign (src/openrouter.ts),
//     so its returned usage covers only the LAST tool-loop round — we sum
//     every round ourselves here instead.
//  2. A pricing table from GET https://openrouter.ai/api/v1/models (disk-cached
//     for 24h) as a fallback estimator when OpenRouter doesn't report cost,
//     and to compute `normalizedCostUsd` (cache discounts removed) for fair
//     cross-config comparison.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CostSource, UsageTotals } from "./types.ts";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const PRICING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Usage of one HTTP round (one streaming request inside the tool loop). */
export interface RoundUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** OpenRouter-reported cost in USD (credits), when usage accounting was returned. */
  costUsd?: number;
}

export interface MeteredFetch {
  fetchImpl: typeof fetch;
  /** Await all in-flight stream sniffing, then return the recorded rounds. */
  drain: () => Promise<RoundUsage[]>;
}

/**
 * Wrap fetch so every OpenRouter chat request asks for usage accounting and
 * every response stream is sniffed (via clone) for the final usage chunk.
 * If OpenRouter rejects the modified body (4xx), the original request is
 * retried once unmodified so the eval still works — cost then falls back to
 * the pricing table.
 */
export function instrumentedFetch(base: typeof fetch = fetch): MeteredFetch {
  const rounds: RoundUsage[] = [];
  const pending: Promise<void>[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const isChat = url.includes("/chat/completions") && typeof init?.body === "string";
    if (!isChat) return base(input, init);

    const withUsage = JSON.stringify({ ...JSON.parse(init!.body as string), usage: { include: true } });
    let res = await base(input, { ...init, body: withUsage });
    if (res.status >= 400 && res.status < 500 && res.status !== 402 && res.status !== 429) {
      // The injected usage field may be the problem — retry once unmodified.
      res = await base(input, init);
    }
    if (res.ok && res.body) {
      const clone = res.clone();
      pending.push(
        lastUsageFromStream(clone)
          .then((u) => {
            if (u) rounds.push(u);
          })
          .catch(() => {}),
      );
    }
    return res;
  }) as typeof fetch;

  return {
    fetchImpl,
    drain: async () => {
      await Promise.all(pending);
      return rounds;
    },
  };
}

/** Scan an SSE stream for the last `usage` object OpenRouter reports. */
async function lastUsageFromStream(res: Response): Promise<RoundUsage | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: any = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed?.usage) usage = parsed.usage;
      } catch {
        // keep-alive comments etc.
      }
    }
  }
  if (!usage) return null;

  const details = usage.prompt_tokens_details;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    cacheReadTokens: details?.cached_tokens ?? usage.cache_read_tokens ?? 0,
    cacheWriteTokens: details?.cache_write_tokens ?? usage.cache_write_tokens ?? 0,
    costUsd: typeof usage.cost === "number" ? usage.cost : undefined,
  };
}

// --- Pricing table fallback ---------------------------------------------

/** USD per token. */
export interface ModelPricing {
  prompt: number;
  completion: number;
}

export type PricingTable = Map<string, ModelPricing>;

/**
 * Load the OpenRouter pricing table, cached on disk (24h TTL) so repeated
 * eval runs don't refetch it.
 */
export async function loadPricing(
  cacheFile: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PricingTable> {
  try {
    const raw = JSON.parse(await readFile(cacheFile, "utf8"));
    if (Date.now() - raw.fetchedAt < PRICING_CACHE_TTL_MS) {
      return new Map(Object.entries(raw.pricing as Record<string, ModelPricing>));
    }
  } catch {
    // no cache yet
  }

  const table: PricingTable = new Map();
  try {
    const res = await fetchImpl(OPENROUTER_MODELS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }> };
    for (const m of data.data ?? []) {
      if (!m.id || !m.pricing) continue;
      const prompt = Number(m.pricing.prompt);
      const completion = Number(m.pricing.completion);
      if (Number.isFinite(prompt) && Number.isFinite(completion)) {
        table.set(m.id, { prompt, completion });
      }
    }
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(
      cacheFile,
      JSON.stringify({ fetchedAt: Date.now(), pricing: Object.fromEntries(table) }),
    );
  } catch (e) {
    console.warn(
      `warning: could not fetch OpenRouter pricing (${e instanceof Error ? e.message : e}); ` +
        "cost estimates will be unavailable where OpenRouter doesn't report cost.",
    );
  }
  return table;
}

/** Look up pricing, tolerating the repo's `~`-prefixed model aliases. */
export function lookupPricing(pricing: PricingTable, model: string): ModelPricing | undefined {
  return pricing.get(model) ?? pricing.get(model.replace(/^~/, ""));
}

export interface CostSummary {
  usage: UsageTotals;
  costUsd: number | null;
  normalizedCostUsd: number | null;
  costSource: CostSource;
}

/**
 * Sum per-round usage into run totals and compute costs.
 *
 * costUsd: OpenRouter-reported when every round carried it; otherwise a
 * pricing-table estimate (which ignores cache discounts and so slightly
 * overestimates); otherwise null.
 *
 * normalizedCostUsd: all prompt tokens priced at the full rate (OpenRouter's
 * prompt_tokens already includes cached tokens), so prompt-cache luck doesn't
 * skew comparisons. Approximation: ignores the cache-write surcharge.
 */
export function summarizeCost(
  rounds: RoundUsage[],
  pricing: PricingTable,
  model: string,
): CostSummary {
  const usage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    rounds: rounds.length,
  };
  for (const r of rounds) {
    usage.promptTokens += r.promptTokens;
    usage.completionTokens += r.completionTokens;
    usage.totalTokens += r.totalTokens;
    usage.cacheReadTokens += r.cacheReadTokens;
    usage.cacheWriteTokens += r.cacheWriteTokens;
  }

  const rate = lookupPricing(pricing, model);
  const estimate = rate
    ? usage.promptTokens * rate.prompt + usage.completionTokens * rate.completion
    : null;

  let costUsd: number | null;
  let costSource: CostSource;
  if (rounds.length > 0 && rounds.every((r) => r.costUsd != null)) {
    costUsd = rounds.reduce((a, r) => a + (r.costUsd ?? 0), 0);
    costSource = "openrouter";
  } else if (estimate != null) {
    costUsd = estimate;
    costSource = "pricing-table";
  } else {
    costUsd = null;
    costSource = "unavailable";
  }

  return { usage, costUsd, normalizedCostUsd: estimate, costSource };
}
