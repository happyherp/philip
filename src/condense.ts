// Conversation condensation: when a chat is both long and the prompt cache has
// expired, summarise the older history with a cheap model so subsequent turns
// send [summary + recent messages] instead of the full transcript.
//
// Everything external (the HTTP fetch) is injected so the logic is unit-testable
// with a canned response and no network.

import type { ConversationMessage } from "./messages.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Same regex as public/frontend/quotes.js — extracts {{quote/q/ref REF @id}} markers.
const MARKER_RE =
  /\{\{(?:quote|q|ref)\s+([^{}@"""]+?)(?:\s*@[a-z0-9]+)?(?:\s+(?:"[^"{}]+"|"[^"{}]+"))?\s*\}\}/g;

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

/** Rough token estimate: total character length / 4. No tokenizer dependency. */
export function estimateTokens(messages: ConversationMessage[]): number {
  let chars = 0;
  for (const m of messages) chars += m.content.length;
  return Math.ceil(chars / 4);
}

/**
 * Extract all Bible references from {{quote/q/ref}} markers in assistant
 * messages. Returns a deduplicated list of trimmed reference strings
 * (e.g. "John 8:31-32") in the order they first appear.
 */
export function extractQuoteReferences(messages: ConversationMessage[]): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    let match: RegExpExecArray | null;
    // Reset lastIndex — the regex has the global flag.
    MARKER_RE.lastIndex = 0;
    while ((match = MARKER_RE.exec(m.content)) !== null) {
      const ref = match[1].trim();
      if (ref && !seen.has(ref)) {
        seen.add(ref);
        refs.push(ref);
      }
    }
  }
  return refs;
}

/**
 * Should we condense? True when BOTH conditions hold:
 * 1. The estimated token count exceeds the threshold.
 * 2. The prompt cache has expired (time since last request > cacheTtlMs).
 */
export function shouldCondense(
  tokenEstimate: number,
  lastRequestAt: number,
  threshold: number,
  cacheTtlMs: number,
): boolean {
  if (tokenEstimate <= threshold) return false;
  return Date.now() - lastRequestAt > cacheTtlMs;
}

// ---------------------------------------------------------------------------
// Prompt for the cheap summariser
// ---------------------------------------------------------------------------

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
};

export function buildCondensePrompt(lang: string): string {
  const name = LANG_NAMES[lang] ?? "English";
  return [
    "You are summarising a Bible-reading conversation so it can be resumed later.",
    `Write the summary in ${name}. Use the structured format below — bullet points, not prose.`,
    "Be concise but preserve ALL of the following:",
    "- Everything the user told you about themselves (name, location, background, preferences, personal details)",
    "- Current reading progress (which book/chapter, where they paused)",
    "- Key discussion topics and any questions the user asked",
    "- The user's expressed interests (e.g. word studies, specific themes)",
    "",
    "Output ONLY the summary in this exact format (omit empty sections):",
    "",
    "USER FACTS:",
    "- (each personal detail on its own line)",
    "",
    "READING PROGRESS:",
    "- (book, chapter, verse where they left off)",
    "",
    "KEY POINTS:",
    "- (each topic/question as a short bullet)",
    "",
    "Do NOT list Bible verses — that is handled separately.",
    "Do NOT add commentary or preamble. Output the structured summary only.",
  ].join("\n");
}

/** Strip {{quote/q/ref ...}} markers from text so the summariser sees clean prose. */
function stripMarkers(text: string): string {
  return text.replace(MARKER_RE, "").replace(/  +/g, " ");
}

function toTranscript(messages: ConversationMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "Reader" : "Philip"}: ${stripMarkers(m.content)}`)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Condense call
// ---------------------------------------------------------------------------

export interface CondenseDeps {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
  lang?: string;
}

export interface CondenseResult {
  /** The condensed summary text (structured bullets + programmatic verse list). */
  summary: string;
}

/**
 * Condense a conversation history into a compact summary string.
 * `messages` should be everything that needs condensing (may include a
 * previous summary as the first user message — the prompt handles both cases).
 */
export async function condenseHistory(
  messages: ConversationMessage[],
  deps: CondenseDeps,
): Promise<CondenseResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lang = deps.lang ?? "en";

  // Extract quote references from ALL messages (including any that will be
  // kept verbatim after the summary) — but the caller should pass only the
  // messages being condensed.
  const refs = extractQuoteReferences(messages);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${deps.apiKey}`,
    "Content-Type": "application/json",
  };
  if (deps.referer) headers["HTTP-Referer"] = deps.referer;
  if (deps.title) headers["X-Title"] = deps.title;

  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new Error("Condense request timed out after 30s")),
    30_000,
  );
  let res: Response;
  try {
    res = await fetchImpl(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: deps.model,
        messages: [
          { role: "system", content: buildCondensePrompt(lang) },
          { role: "user", content: toTranscript(messages) },
        ],
        stream: false,
        max_tokens: 600,
        temperature: 0.2,
      }),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Condense request failed: HTTP ${res.status} ${detail}`.trim());
  }

  const data = (await res.json()) as any;
  let summary: string = data?.choices?.[0]?.message?.content ?? "";
  summary = summary.trim();

  // Programmatically append the verse list — more reliable than LLM extraction.
  if (refs.length > 0) {
    summary += `\n\nVERSES DISCUSSED: ${refs.join(", ")}`;
  }

  return { summary };
}
