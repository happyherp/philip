// Transport-agnostic chat endpoint logic: takes a client conversation, runs
// Philip's tool loop, and returns a streaming SSE Response. The Cloudflare
// Pages Function (and, later, a WhatsApp webhook) are thin wrappers over this.

import { type AssetFetch } from "./bible.ts";
import { type ChatMessage, runChat } from "./openrouter.ts";
import { buildSystemPrompt } from "./philip.ts";
import { translationById, translationForLang } from "./translations.ts";

export interface StreamChatOptions {
  /** Raw conversation from the client (only role/content trusted). */
  history: unknown;
  apiKey: string;
  model: string;
  assetFetch: AssetFetch;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
  /** Called with the complete final assistant text (after tool loops) so caller can persist it. */
  onAssistantFinal?: (text: string) => void | Promise<void>;
  /** If set, emitted as X-Conversation-Id response header so clients can learn a newly created id immediately. */
  conversationId?: string;
  /** ISO 639-1 language code for the reader (e.g. "en", "es", "de"). Selects system prompt and Bible translation. */
  lang?: string;
}

/** Keep only well-formed user/assistant turns from untrusted client input. */
export function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
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

/** Result of {@link streamChatResponse}: the SSE response plus its pump promise. */
export interface StreamChatResult {
  response: Response;
  /** Resolves when streaming finishes; hand to `ctx.waitUntil` in a Worker. */
  pump: Promise<void>;
}

/** Build a Response that streams the answer to the browser as SSE. */
export function streamChatResponse(opts: StreamChatOptions): StreamChatResult {
  const history = sanitizeHistory(opts.history);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (obj: unknown) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const lang = opts.lang ?? "en";
  const translation = translationForLang(lang);

  const pump = (async () => {
    try {
      if (history.length === 0) {
        await send({ error: "No message provided." });
        return;
      }
      const finalText = await runChat(history, {
        apiKey: opts.apiKey,
        model: opts.model,
        assetFetch: opts.assetFetch,
        fetchImpl: opts.fetchImpl,
        referer: opts.referer,
        title: opts.title,
        systemPrompt: buildSystemPrompt(lang),
        translationId: translation.id,
        onToken: (t) => send({ token: t }),
        onTranslationUsed: (tid) => {
          const meta = translationById(tid);
          send({ lang: meta.lang });
        },
      });
      if (opts.onAssistantFinal) {
        await opts.onAssistantFinal(finalText);
      }
      await send({ done: true });
    } catch (err) {
      await send({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      await writer.close();
    }
  })();

  const responseHeaders: Record<string, string> = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  };
  if (opts.conversationId) {
    responseHeaders["x-conversation-id"] = opts.conversationId;
  }
  const response = new Response(readable, {
    headers: responseHeaders,
  });

  return { response, pump };
}
