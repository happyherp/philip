// Cloudflare Pages Function: POST /api/chat
// Thin wrapper that wires the Worker env (asset binding + secrets) into the
// transport-agnostic chat logic in src/chat.ts.
//
// New contract (server owns history):
//   POST { conversationId?: string, message: string }
//   - If no conversationId, creates a new conversation in D1.
//   - Always persists the incoming user message first.
//   - Runs Philip, streams tokens, then persists the final assistant reply.
//   - Returns SSE + X-Conversation-Id header (so client can learn a new id instantly).

import {
  appendMessage,
  createConversation,
  getConversationMessages,
} from "../../src/db.ts";
import { streamChatResponse } from "../../src/chat.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;

  if (!env.OPENROUTER_API_KEY) {
    console.error("[philip] OPENROUTER_API_KEY is not set");
    return json({ error: "Server is missing OPENROUTER_API_KEY." }, 500);
  }
  if (!env.DB) {
    console.error("[philip] DB binding is not configured");
    return json({ error: "Server is missing DB binding." }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : undefined;
  const userMessage =
    typeof body.message === "string" ? body.message.trim() : "";

  if (!userMessage) {
    return json({ error: "message is required" }, 400);
  }

  // Resolve or create conversation, load prior turns for the LLM context.
  // We trust an explicit conversationId from the client (e.g. from ?c= or from previous header).
  // Only auto-create when the client did not supply one.
  let convId = conversationId;
  let priorMessages: { role: "user" | "assistant"; content: string }[] = [];

  if (convId) {
    priorMessages = await getConversationMessages(env.DB, convId);
  } else {
    convId = await createConversation(env.DB);
  }

  // Persist the user turn. If the provided id was bogus (no parent row), fall back to a fresh convo.
  try {
    await appendMessage(env.DB, convId, "user", userMessage);
  } catch (e) {
    console.warn("[philip] append user to provided conv failed (bad id?), creating fresh", e);
    convId = await createConversation(env.DB);
    priorMessages = [];
    await appendMessage(env.DB, convId, "user", userMessage);
  }

  const historyForLLM = [...priorMessages, { role: "user" as const, content: userMessage }];

  console.log(
    `[philip] chat request – model=${model} conv=${convId} turns=${historyForLLM.length}`,
  );

  const { response, pump } = streamChatResponse({
    history: historyForLLM,
    apiKey: env.OPENROUTER_API_KEY,
    model,
    assetFetch: (path) => env.ASSETS.fetch(new URL(path, request.url)),
    referer: new URL(request.url).origin,
    title: "Philip",
    conversationId: convId,
    onAssistantFinal: (text: string) => {
      const t = text?.trim();
      if (!t) return Promise.resolve();
      // Awaited by the pump before "done" is sent
      return appendMessage(env.DB, convId, "assistant", t).catch((e) =>
        console.error("[philip] failed to persist assistant message", e),
      );
    },
  });

  context.waitUntil(
    pump.then(
      () => console.log("[philip] chat stream finished"),
      (err) => console.error("[philip] chat stream error:", err),
    ),
  );
  return response;
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
