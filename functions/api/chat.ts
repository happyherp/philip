// Cloudflare Pages Function: POST /api/chat
// Thin wrapper that wires the Worker env (asset binding + secrets) into the
// transport-agnostic chat logic in src/chat.ts.

import { streamChatResponse } from "../../src/chat.ts";

interface Env {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.OPENROUTER_API_KEY) {
    return json({ error: "Server is missing OPENROUTER_API_KEY." }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const { response, pump } = streamChatResponse({
    history: (body as { messages?: unknown })?.messages,
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
    // Read bundled bible JSON from the same origin's static assets.
    assetFetch: (path) => env.ASSETS.fetch(new URL(path, request.url)),
    referer: new URL(request.url).origin,
    title: "Philip",
  });

  context.waitUntil(pump);
  return response;
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
