// Talks to POST /api/chat and parses the SSE stream. The fetch impl is
// injectable so it can be tested without a server.

/**
 * Stream a chat turn. The browser owns the conversation: the full history is
 * sent every turn and the server persists nothing.
 *
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages - full conversation history
 * @param {string} [opts.lang] - ISO 639-1 language code ("en", "es", "de")
 * @param {(token: string) => void} opts.onToken
 * @param {(status: {type: string, reference?: string, translation?: string}) => void} [opts.onStatus] - progress updates (e.g. a passage being read)
 * @param {(lang: string) => void} [opts.onLang] - called when the model chooses a language/translation
 * @param {(condensed: {summary: string, upToIndex: number}) => void} [opts.onCondensed] - called when the server condenses the conversation
 * @param {() => void} [opts.onDone]
 * @param {(message: string, info?: {status?: number, code?: string, refillUrl?: string}) => void} [opts.onError]
 * @param {number} [opts.lastRequestAt] - unix-ms timestamp of the previous chat request
 * @param {string} [opts.condensedSummary] - existing condensed summary from a prior round
 * @param {boolean} [opts.searchReady] - whether semantic search is confirmed warm (enables the search_scripture tool)
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 */
export async function streamChat({
  messages,
  lang,
  onToken,
  onStatus,
  onLang,
  onCondensed,
  onDone,
  onError,
  lastRequestAt,
  condensedSummary,
  searchReady,
  fetchImpl = fetch,
  url = "/api/chat",
}) {
  const body = { messages, lang };
  if (lastRequestAt) body.lastRequestAt = lastRequestAt;
  if (condensedSummary) body.condensedSummary = condensedSummary;
  if (searchReady) body.searchReady = true;

  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!res.ok || !res.body) {
    let message = `Request failed (HTTP ${res.status}).`;
    let code;
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
      if (data && typeof data.code === "string") code = data.code;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    onError?.(message, { status: res.status, code });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;

      let evt;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      if (typeof evt.token === "string") onToken(evt.token);
      else if (evt.status && typeof evt.status === "object") onStatus?.(evt.status);
      else if (typeof evt.lang === "string") onLang?.(evt.lang);
      else if (evt.condensed && typeof evt.condensed === "object") onCondensed?.(evt.condensed);
      else if (evt.error) {
        finished = true;
        if (evt.code || evt.refillUrl) onError?.(evt.error, { code: evt.code, refillUrl: evt.refillUrl });
        else onError?.(evt.error);
      } else if (evt.done) {
        finish();
      }
    }
  }

  finish();
}
