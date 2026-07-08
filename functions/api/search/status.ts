// Cloudflare Pages Function: GET /api/search/status
// Warm-up + readiness probe for the semantic-search backend (luther-mcp).
//
// The browser calls this on load and polls it: the first hit *warms* a sleeping
// HuggingFace Space, and the returned status drives the header indicator
// (green/yellow/red). Only when this reports "ready" does the client enable the
// search_scripture tool for /api/chat.
//
// Intentionally NOT rate-limited via the D1 IP counter: it hits the free Space,
// not the paid OpenRouter budget, and must not consume the reader's shared daily
// chat quota. The short server-side probe timeout + bounded client polling are
// the guardrails.

import { json } from "../../../src/http.ts";
import { probeSearch, resolveSearchUrl } from "../../../src/search.ts";

interface Env {
  LUTHER_SEARCH_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = resolveSearchUrl(context.env.LUTHER_SEARCH_URL);
  if (!url) {
    return json(
      { status: "error", detail: "Semantic search is not configured.", latencyMs: 0 },
      200,
    );
  }
  const result = await probeSearch({ url });
  return json(result, 200);
};
