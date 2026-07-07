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
