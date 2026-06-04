// Talks to POST /api/chat and parses the SSE stream. The fetch impl is
// injectable so it can be tested without a server.

/**
 * Stream a chat turn.
 * Supports the new server-persisted contract (preferred) and the old full-history one.
 *
 * @param {object} opts
 * @param {string} [opts.conversationId]
 * @param {string} [opts.message] - new style: just the latest user message
 * @param {Array<{role:string,content:string}>} [opts.messages] - legacy full history
 * @param {(token: string) => void} opts.onToken
 * @param {(id: string) => void} [opts.onConversationId] - called if server returns X-Conversation-Id (new convos)
 * @param {() => void} [opts.onDone]
 * @param {(message: string) => void} [opts.onError]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 */
export async function streamChat({
  conversationId,
  message,
  messages,
  onToken,
  onConversationId,
  onDone,
  onError,
  fetchImpl = fetch,
  url = "/api/chat",
}) {
  const body = message
    ? { conversationId, message }
    : { messages };

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
    onError?.(`Request failed (HTTP ${res.status}).`);
    return;
  }

  // New conversations (or first turn) learn their server id from the header immediately.
  const convId = res.headers.get("x-conversation-id");
  if (convId) {
    onConversationId?.(convId);
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
