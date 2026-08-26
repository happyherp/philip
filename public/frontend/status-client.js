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
 * Poll GET /api/search/status until it reports "ready" or a hard "error", or
 * until `maxTries` is exhausted. Each hit doubles as a keep-alive/wake nudge
 * to the backend.
 *
 * A backend that never wakes up (e.g. a HuggingFace Space stuck crashed
 * rather than merely asleep) reports "warming" on every probe forever, since
 * the server side can't tell a cold-start apart from a wedged service — both
 * surface as a 503. Left unbounded, the caller would show "warming up…" to
 * the reader indefinitely even after this function gives up retrying. So
 * once `maxTries` is exhausted while still "warming", this reports "error"
 * instead, so the UI reflects that it actually stopped trying.
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 * @param {number} [opts.maxTries]
 * @param {number} [opts.intervalMs] - delay between attempts
 * @param {(status: "ready"|"warming"|"error", detail: string) => void} [opts.onUpdate] - called after each attempt
 * @param {() => boolean} [opts.isCancelled] - checked before each attempt; polling stops silently once true
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @returns {Promise<{status: "ready"|"warming"|"error", detail: string} | null>} final result, or null if cancelled
 */
export async function pollSearchStatus({
  fetchImpl = fetch,
  url = "/api/search/status",
  maxTries = 8,
  intervalMs = 3000,
  onUpdate,
  isCancelled = () => false,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    if (isCancelled()) return null;

    const { status, detail } = await fetchSearchStatus({ fetchImpl, url });
    if (isCancelled()) return null;

    const gaveUp = status === "warming" && attempt + 1 >= maxTries;
    const result = gaveUp
      ? {
          status: "error",
          detail: detail
            ? `${detail} Gave up waiting for it to finish waking up.`
            : "Gave up waiting for the search service to finish waking up.",
        }
      : { status, detail };

    onUpdate?.(result.status, result.detail);
    if (result.status !== "warming") return result;

    await sleep(intervalMs);
  }
}
