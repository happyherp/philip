// Minimal promise pool + retry helpers for running eval permutations in parallel.

import { InsufficientCreditsError } from "../src/openrouter.ts";

/**
 * Run `worker` over `items` with at most `concurrency` in flight. Results keep
 * item order. `shouldStop` is checked before each new item starts (in-flight
 * items finish), so a fatal error can drain the pool early.
 */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const started: boolean[] = new Array(items.length).fill(false);
  let next = 0;

  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      if (shouldStop?.()) return;
      const i = next++;
      if (i >= items.length) return;
      started[i] = true;
      results[i] = await worker(items[i], i);
    }
  });

  await Promise.all(lanes);
  return results.filter((_, i) => started[i]);
}

/**
 * Transient failures worth retrying: rate limits, upstream 5xx, the 30s
 * request timeout inside runChat, and plain network hiccups. Never retries
 * InsufficientCreditsError (HTTP 402) — more attempts cannot help.
 */
export function isTransientError(e: unknown): boolean {
  if (e instanceof InsufficientCreditsError) return false;
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP (429|5\d\d)/.test(msg)) return true;
  if (/timed out/i.test(msg)) return true;
  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|socket/i.test(msg)) return true;
  return e instanceof Error && e.name === "AbortError";
}

export interface RetryOpts {
  /** Additional attempts after the first (2 → up to 3 attempts total). */
  retries: number;
  shouldRetry?: (e: unknown) => boolean;
  baseDelayMs?: number;
  onRetry?: (e: unknown, attempt: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  const shouldRetry = opts.shouldRetry ?? isTransientError;
  const base = opts.baseDelayMs ?? 2000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= opts.retries || !shouldRetry(e)) throw e;
      opts.onRetry?.(e, attempt + 1);
      // Exponential backoff with jitter: ~2s, ~4s, ~8s ...
      const delay = base * 2 ** attempt * (0.75 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
