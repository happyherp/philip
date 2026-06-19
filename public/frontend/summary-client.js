// Talks to POST /api/summary to label a finished conversation. The fetch impl
// is injectable so it can be tested without a server.

/**
 * Ask the server for a short title + verse-referencing summary of a conversation.
 *
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages - full conversation history
 * @param {string} [opts.lang] - ISO 639-1 language code
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.url]
 * @returns {Promise<{title: string, summary: string}>} empty strings on failure
 */
export async function summarizeConversation({
  messages,
  lang,
  fetchImpl = fetch,
  url = "/api/summary",
}) {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, lang }),
    });
    if (!res.ok) return { title: "", summary: "" };
    const data = await res.json().catch(() => null);
    return {
      title: typeof data?.title === "string" ? data.title : "",
      summary: typeof data?.summary === "string" ? data.summary : "",
    };
  } catch {
    return { title: "", summary: "" };
  }
}
