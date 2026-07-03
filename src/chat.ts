// Transport-agnostic chat endpoint logic: takes a client conversation, runs
// Philip's tool loop, and returns a streaming SSE Response. The Cloudflare
// Pages Function (and, later, a WhatsApp webhook) are thin wrappers over this.

import { type AssetFetch } from "./bible.ts";
import { condenseHistory, estimateTokens, shouldCondense } from "./condense.ts";
import type { ConversationMessage } from "./messages.ts";
import { runChat } from "./openrouter.ts";
import { buildSystemPrompt } from "./philip.ts";
import { translationById, translationForLang } from "./translations.ts";
import { sanitizeHistory } from "./messages.ts";

// Re-exported so the Pages Function (which already imports streamChatResponse
// from here) can sanitize the client history from a single module.
export { sanitizeHistory };

export interface StreamChatOptions {
  /** Raw conversation from the client (only role/content trusted). */
  history: unknown;
  apiKey: string;
  model: string;
  assetFetch: AssetFetch;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
  /** ISO 639-1 language code for the reader (e.g. "en", "es", "de"). Selects system prompt and Bible translation. */
  lang?: string;
  /** Cheap model for condensation (e.g. "anthropic/claude-haiku-latest"). If unset, condensation is disabled. */
  condenseModel?: string;
  /** Token-count threshold above which condensation may trigger (default 8000). */
  condenseThreshold?: number;
  /** Cache TTL in ms — condensation only fires when the cache has gone cold (default 300 000 = 5 min). */
  condenseCacheTtlMs?: number;
  /** Unix-ms timestamp of the browser's last chat request (used to check cache staleness). */
  lastRequestAt?: number;
  /** Existing condensed summary from a previous condensation round (sent by the client). */
  condensedSummary?: string;
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

      // --- Condensation: summarise old history when it's long AND the cache is cold ---
      let llmHistory: ConversationMessage[] = history;
      const condenseModel = opts.condenseModel;
      const condenseThreshold = opts.condenseThreshold ?? 8000;
      const condenseCacheTtlMs = opts.condenseCacheTtlMs ?? 300_000;
      const lastRequestAt = opts.lastRequestAt ?? 0;

      // Build the effective history the LLM will see. If the client already has
      // a condensed summary from a previous round, prepend it.
      let effectiveHistory: ConversationMessage[];
      if (opts.condensedSummary) {
        effectiveHistory = [
          { role: "user", content: `[Conversation summary]\n${opts.condensedSummary}` },
          { role: "assistant", content: "Understood, I have the context. Let's continue." },
          ...history,
        ];
      } else {
        effectiveHistory = history;
      }

      if (
        condenseModel &&
        shouldCondense(estimateTokens(effectiveHistory), lastRequestAt, condenseThreshold, condenseCacheTtlMs)
      ) {
        try {
          // Condense the entire effective history (summary-so-far + recent).
          const { summary } = await condenseHistory(effectiveHistory, {
            apiKey: opts.apiKey,
            model: condenseModel,
            fetchImpl: opts.fetchImpl,
            referer: opts.referer,
            lang,
          });
          // Tell the client to store the new summary. upToIndex covers all
          // messages the client sent this turn (everything in `history`).
          await send({ condensed: { summary, upToIndex: history.length } });
          // Replace the full history with the condensed version for the LLM.
          effectiveHistory = [
            { role: "user", content: `[Conversation summary]\n${summary}` },
            { role: "assistant", content: "Understood, I have the context. Let's continue." },
            ...history.slice(-2), // keep the most recent exchange for immediate continuity
          ];
          console.log("[philip] condensed conversation", {
            originalTokens: estimateTokens(history),
            condensedTokens: estimateTokens(effectiveHistory),
          });
        } catch (err) {
          // Fail open — if condensation fails, just use the full history.
          console.error("[philip] condensation failed, using full history", err);
        }
      }

      llmHistory = effectiveHistory;

      await runChat(llmHistory, {
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
          // Scholarly texts (Greek/Hebrew/Latin) are not UI languages — a word
          // study must not flip the frontend i18n.
          if (meta && !meta.scholarly) send({ lang: meta.lang });
        },
        onPassageRequest: ({ reference, translationId }) => {
          // Tell the browser which passage Philip is reading, so it can show
          // progress instead of an empty bubble during the tool call.
          const meta = translationById(translationId);
          send({ status: { type: "reading", reference, translation: meta?.name ?? translationId } });
        },
      });
      await send({ done: true });
    } catch (err) {
      await send({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      await writer.close();
    }
  })();

  const response = new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });

  return { response, pump };
}
