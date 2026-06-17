// The conversation shape the browser sends us, and the guard that keeps only
// well-formed turns from untrusted client input. Kept dependency-free so both
// the chat path and the lightweight share endpoints can use it without pulling
// in the OpenRouter/Bible graph.

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/** Keep only well-formed user/assistant turns from untrusted client input. */
export function sanitizeHistory(raw: unknown): ConversationMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ConversationMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as any).role;
    const content = (m as any).content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      out.push({ role, content });
    }
  }
  return out;
}
