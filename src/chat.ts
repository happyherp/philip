// Transport-agnostic chat endpoint logic: takes a client conversation, runs
// Philip's tool loop, and returns a streaming SSE Response. The Cloudflare
// Pages Function (and, later, a WhatsApp webhook) are thin wrappers over this.

import { type AssetFetch } from "./bible.ts";
import { type ChatMessage, runChat } from "./openrouter.ts";

export interface StreamChatOptions {
  /** Raw conversation from the client (only role/content trusted). */
  history: unknown;
  apiKey: string;
  model: string;
  assetFetch: AssetFetch;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
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

  const pump = (async () => {
    try {
      if (history.length === 0) {
        await send({ error: "No message provided." });
        return;
      }
      await runChat(history, {
        apiKey: opts.apiKey,
        model: opts.model,
        assetFetch: opts.assetFetch,
        fetchImpl: opts.fetchImpl,
        referer: opts.referer,
        title: opts.title,
        onToken: (t) => send({ token: t }),
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
