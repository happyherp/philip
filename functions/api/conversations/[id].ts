// GET /api/conversations/:id
// Returns the full persisted conversation so the web UI (or future clients) can resume.

import { getConversation } from "../../../src/db.ts";

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const id = params.id as string | undefined;

  if (!id) {
    return json({ error: "Missing conversation id" }, 400);
  }
  if (!env.DB) {
    return json({ error: "DB not configured" }, 500);
  }

  const conv = await getConversation(env.DB, id);
  if (!conv) {
    return json({ error: "Conversation not found" }, 404);
  }

  return json({
    id: conv.id,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages,
  }, 200);
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
