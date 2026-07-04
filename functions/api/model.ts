// Cloudflare Pages Function: GET /api/model
// Exposes the identifier of the LLM the server is configured to use (the
// OPENROUTER_MODEL secret), so the About panel can name the underlying model.
// Read-only and non-sensitive: it returns only the model id, never the API key.

import { json } from "../../src/http.ts";

interface Env {
  OPENROUTER_MODEL?: string;
}

// Keep in step with functions/api/chat.ts's DEFAULT_MODEL.
const DEFAULT_MODEL = "~anthropic/claude-sonnet-latest";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const model = context.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  return json({ model }, 200);
};
