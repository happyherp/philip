// The saved-conversations store: pure helpers over a plain array of archived
// conversations. No DOM, no network — easy to unit test. The browser is the
// only home for these; app.js persists the array to localStorage.

/**
 * @typedef {Object} SavedConversation
 * @property {string} id
 * @property {string} title    - short label, renameable by the reader
 * @property {string} summary  - one line referencing the verses last discussed
 * @property {Array<{role:string,content:string}>} messages
 * @property {string} lang
 * @property {number} createdAt
 */

/** A short, collision-resistant id for a saved conversation. */
export function newId() {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

/** Keep only well-formed saved conversations from untrusted localStorage. */
export function sanitizeList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    if (!Array.isArray(c.messages) || c.messages.length === 0) continue;
    out.push({
      id: typeof c.id === "string" ? c.id : newId(),
      title: typeof c.title === "string" ? c.title : "",
      summary: typeof c.summary === "string" ? c.summary : "",
      messages: c.messages,
      lang: typeof c.lang === "string" ? c.lang : "en",
      createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    });
  }
  return out;
}

/**
 * A best-effort title from the first user turn, for when the LLM summary is
 * unavailable (offline, rate-limited, etc.).
 */
export function fallbackTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  const text = (firstUser?.content || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > 40 ? text.slice(0, 40).trimEnd() + "…" : text;
}

/**
 * Build a saved-conversation record. Falls back to the first user turn when the
 * generated title is empty.
 */
export function makeRecord({ messages, lang, title, summary }) {
  const cleanTitle = (title || "").trim() || fallbackTitle(messages);
  return {
    id: newId(),
    title: cleanTitle,
    summary: (summary || "").trim(),
    messages,
    lang: lang || "en",
    createdAt: Date.now(),
  };
}

/** Prepend a record (newest first) and return a new array. */
export function addRecord(list, record) {
  return [record, ...list];
}

/** Remove the record with the given id, returning a new array. */
export function removeRecord(list, id) {
  return list.filter((c) => c.id !== id);
}

/** Rename the record with the given id, returning a new array. */
export function renameRecord(list, id, title) {
  return list.map((c) =>
    c.id === id ? { ...c, title: title.trim() || c.title } : c,
  );
}
