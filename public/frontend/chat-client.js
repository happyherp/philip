// Talks to POST /api/chat and parses the SSE stream. The fetch impl is
// injectable so it can be tested without a server.

/**
 * Stream a chat turn.
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {(token: string) => void} opts.onToken
 * @param {() => void} [opts.onDone]
 * @param {(message: string) => void} [opts.onError]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 */
export async function streamChat({
  messages,
  onToken,
  onDone,
  onError,
  fetchImpl = fetch,
  url = "/api/chat",
}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!res.ok || !res.body) {
    onError?.(`Request failed (HTTP ${res.status}).`);
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
