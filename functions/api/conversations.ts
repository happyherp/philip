// POST /api/conversations
// Create a brand new (empty) conversation. Returns { id }.
// The first user message can be sent via POST /api/chat { conversationId, message }.

import { createConversation } from "../../src/db.ts";

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env } = context;

  if (!env.DB) {
    return json({ error: "DB not configured" }, 500);
  }

  const id = await createConversation(env.DB);
  return json({ id }, 201);
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
