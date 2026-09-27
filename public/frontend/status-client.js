// Talks to GET /api/search/status to learn whether the semantic-search backend
// is warm. The fetch impl is injectable so it can be tested without a server.

/**
 * Probe the semantic-search backend. The server call also *warms* a sleeping
 * service, so repeated calls double as keep-alive.
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 * @returns {Promise<{status: "ready"|"warming"|"error", detail: string}>}
 */
export async function fetchSearchStatus({ fetchImpl = fetch, url = "/api/search/status" } = {}) {
  try {
    const res = await fetchImpl(url, { method: "GET" });
    if (!res.ok) return { status: "error", detail: `Status check failed (HTTP ${res.status}).` };
    const data = await res.json().catch(() => null);
    const status =
      data && (data.status === "ready" || data.status === "warming" || data.status === "error")
        ? data.status
        : "error";
    const detail = data && typeof data.detail === "string" ? data.detail : "";
    return { status, detail };
  } catch {
    return { status: "error", detail: "Could not reach the search service." };
  }
}

/**
 * Poll GET /api/search/status until it reports "ready" or a hard "error". Each
 * hit doubles as a keep-alive/wake nudge to the backend.
 *
 * Two phases, because a sleeping HuggingFace Space needs ~1-2+ minutes to cold
 * start (sometimes a full container rebuild):
 *
 * 1. Warm-up: probe with a growing interval (initialIntervalMs, multiplied by
 *    backoffFactor, capped at maxIntervalMs) until warmupBudgetMs of waiting
 *    has been spent.
 * 2. Background: if still "warming", keep the status "warming" (the detail
 *    says it is being checked in the background) and probe every
 *    backgroundIntervalMs, so search still switches on later in the session.
 *
 * A backend stuck crashed rather than asleep reports "warming" forever (the
 * server can't tell a cold start from a wedged service — both are a 503). So
 * once backgroundMaxTries background probes are spent, this reports "error"
 * instead of claiming "warming up" indefinitely.
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 * @param {number} [opts.initialIntervalMs] - first delay between warm-up attempts
 * @param {number} [opts.backoffFactor] - warm-up delay multiplier per attempt
 * @param {number} [opts.maxIntervalMs] - cap on the warm-up delay
 * @param {number} [opts.warmupBudgetMs] - total warm-up waiting before switching to background checks
 * @param {number} [opts.backgroundIntervalMs] - delay between background checks
 * @param {number} [opts.backgroundMaxTries] - background checks before giving up with "error"
 * @param {(status: "ready"|"warming"|"error", detail: string) => void} [opts.onUpdate] - called after each attempt
 * @param {() => boolean} [opts.isCancelled] - checked before each attempt; polling stops silently once true
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @returns {Promise<{status: "ready"|"warming"|"error", detail: string} | null>} final result, or null if cancelled
 */
export async function pollSearchStatus({
  fetchImpl = fetch,
  url = "/api/search/status",
  initialIntervalMs = 3000,
  backoffFactor = 1.5,
  maxIntervalMs = 15000,
  warmupBudgetMs = 180000,
  backgroundIntervalMs = 60000,
  backgroundMaxTries = 60,
  onUpdate,
  isCancelled = () => false,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  // Phase 1: warm-up with backoff.
  let waited = 0;
  let delay = initialIntervalMs;
  let last;
  for (;;) {
    if (isCancelled()) return null;
    last = await fetchSearchStatus({ fetchImpl, url });
    if (isCancelled()) return null;
    if (last.status !== "warming") {
      onUpdate?.(last.status, last.detail);
      return last;
    }
    if (waited >= warmupBudgetMs) break;
    onUpdate?.(last.status, last.detail);
    await sleep(delay);
    waited += delay;
    delay = Math.min(delay * backoffFactor, maxIntervalMs);
  }

  // Phase 2: slow background checks.
  const backgroundDetail = (detail) =>
    detail
      ? `${detail} Still waking up — checking again in the background.`
      : "Still waking up — checking again in the background.";
  onUpdate?.("warming", backgroundDetail(last.detail));
  for (let attempt = 0; attempt < backgroundMaxTries; attempt++) {
    await sleep(backgroundIntervalMs);
    if (isCancelled()) return null;
    last = await fetchSearchStatus({ fetchImpl, url });
    if (isCancelled()) return null;
    if (last.status !== "warming") {
      onUpdate?.(last.status, last.detail);
      return last;
    }
    if (attempt + 1 < backgroundMaxTries) onUpdate?.("warming", backgroundDetail(last.detail));
  }

  const gaveUp = {
    status: "error",
    detail: last.detail
      ? `${last.detail} Gave up waiting for it to finish waking up.`
      : "Gave up waiting for the search service to finish waking up.",
  };
  onUpdate?.(gaveUp.status, gaveUp.detail);
  return gaveUp;
}
