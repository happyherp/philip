// Conversation summarisation: a single, non-streaming OpenRouter call that
// distils a finished conversation into a short title and a one-line summary
// that names the most significant Bible verses last discussed.
//
// Everything external (the HTTP fetch) is injected so the logic is unit-testable
// with a canned response and no network.

import type { ConversationMessage } from "./messages.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
};

export interface SummarizeDeps {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
  /** ISO 639-1 language code for the reader (e.g. "en", "es", "de"). */
  lang?: string;
}

export interface ConversationSummary {
  /** A short label (a few words) for the conversation list. */
  title: string;
  /** One sentence that references the significant verses last discussed. */
  summary: string;
}

/** Render the conversation as a plain transcript for the summariser. */
function toTranscript(history: ConversationMessage[]): string {
  return history
    .map((m) => `${m.role === "user" ? "Reader" : "Philip"}: ${m.content}`)
    .join("\n\n");
}

function buildPrompt(lang: string): string {
  const name = LANG_NAMES[lang] ?? "English";
  return [
    "You are labelling a finished Bible-reading conversation so the reader can",
    "find it again in a list. Read the transcript and reply with ONLY a JSON",
    'object of the form {"title": "...", "summary": "..."} and nothing else.',
    "",
    `Write both the title and the summary in ${name}.`,
    "- title: at most six words, no quotation marks, naming the topic or passage.",
    "- summary: a single short sentence describing what was discussed. It MUST",
    "  reference the most significant Bible verse(s) that were last discussed,",
    '  using a standard citation (e.g. "John 3:16" or "Psalm 23").',
    "Do not add any commentary outside the JSON object.",
  ].join("\n");
}

/** Pull the first balanced {...} JSON object out of a model reply. */
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse the model reply into a summary, tolerating extra prose around the JSON. */
export function parseSummary(reply: string): ConversationSummary {
  const fallback: ConversationSummary = { title: "", summary: "" };
  const jsonText = extractJson(reply);
  if (!jsonText) return fallback;
  try {
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    return { title, summary };
  } catch {
    return fallback;
  }
}

/**
 * Summarise a conversation into a short title + verse-referencing summary.
 * Makes a single non-streaming OpenRouter completion.
 */
export async function summarizeConversation(
  history: ConversationMessage[],
  deps: SummarizeDeps,
): Promise<ConversationSummary> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lang = deps.lang ?? "en";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${deps.apiKey}`,
    "Content-Type": "application/json",
  };
  if (deps.referer) headers["HTTP-Referer"] = deps.referer;
  if (deps.title) headers["X-Title"] = deps.title;

  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new Error("OpenRouter summary request timed out after 30s")),
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
          { role: "system", content: buildPrompt(lang) },
          { role: "user", content: toTranscript(history) },
        ],
        // No tools, no streaming — this is a one-shot labelling call.
        stream: false,
        max_tokens: 200,
        temperature: 0.2,
      }),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter summary failed: HTTP ${res.status} ${detail}`.trim());
  }

  const data = (await res.json()) as any;
  const reply: string = data?.choices?.[0]?.message?.content ?? "";
  return parseSummary(reply);
}
