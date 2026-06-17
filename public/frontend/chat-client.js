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
 * @param {(lang: string) => void} [opts.onLang] - called when the model chooses a language/translation
 * @param {() => void} [opts.onDone]
 * @param {(message: string, info?: {status?: number, code?: string}) => void} [opts.onError]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 */
export async function streamChat({
  messages,
  lang,
  onToken,
  onLang,
  onDone,
  onError,
  fetchImpl = fetch,
  url = "/api/chat",
}) {
  const body = { messages, lang };

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
      else if (typeof evt.lang === "string") onLang?.(evt.lang);
      else if (evt.error) {
        finished = true;
        onError?.(evt.error);
      } else if (evt.done) {
        finish();
      }
    }
  }

  finish();
}
