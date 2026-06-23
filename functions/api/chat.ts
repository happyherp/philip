// Cloudflare Pages Function: POST /api/chat
// Thin wrapper that wires the Worker env (asset binding + secrets) into the
// transport-agnostic chat logic in src/chat.ts.
//
// Contract (the browser owns history):
//   POST { messages: [{ role, content }], lang? }
//   - The full conversation lives in the reader's browser and is sent each turn.
//   - The server never persists conversation content (see /api/share for the
//     explicit, opt-in sharing path).
//   - Runs Philip and streams tokens back as SSE.

import { streamChatResponse, sanitizeHistory } from "../../src/chat.ts";
import { DEFAULT_LIMITS, recordIpUsage } from "../../src/rate-limit.ts";
import { clientIp, json, parsePositiveInt, resolveLang } from "../../src/http.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  MAX_MESSAGES_PER_CONVERSATION?: string;
  MAX_MESSAGES_PER_IP_PER_DAY?: string;
  CONDENSE_MODEL?: string;
  CONDENSE_TOKEN_THRESHOLD?: string;
  CONDENSE_CACHE_TTL_SECONDS?: string;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const DEFAULT_CONDENSE_MODEL = "anthropic/claude-haiku-4";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;

  if (!env.OPENROUTER_API_KEY) {
    console.error("[philip] OPENROUTER_API_KEY is not set");
    return json({ error: "Server is missing OPENROUTER_API_KEY." }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  // The browser sends the full conversation each turn; we only trust role/content.
  const history = sanitizeHistory(body.messages);
  if (history.length === 0) {
    return json({ error: "message is required" }, 400);
  }
  if (history[history.length - 1].role !== "user") {
    return json({ error: "The last message must be from the user." }, 400);
  }

  // Language: prefer explicit body param, fall back to Accept-Language header, default "en".
  const lang = resolveLang(
    typeof body.lang === "string" ? body.lang : null,
    request.headers.get("Accept-Language"),
  );

  const ip = clientIp(request);

  // --- Usage caps: the per-conversation and per-IP/day backstops that bound
  // how much this public, unauthenticated endpoint can spend on LLM calls. ---
  const maxPerConversation =
    parsePositiveInt(env.MAX_MESSAGES_PER_CONVERSATION) ??
    DEFAULT_LIMITS.maxMessagesPerConversation;
  const maxPerIpPerDay =
    parsePositiveInt(env.MAX_MESSAGES_PER_IP_PER_DAY) ??
    DEFAULT_LIMITS.maxMessagesPerIpPerDay;

  const userTurns = history.filter((m) => m.role === "user").length;
  if (userTurns > maxPerConversation) {
    return json(
      { error: "This conversation has reached its message limit. Please start a new chat." },
      429,
    );
  }

  if (env.DB) {
    try {
      const ipUsage = await recordIpUsage(env.DB, ip, maxPerIpPerDay);
      if (!ipUsage.allowed) {
        console.warn(`[philip] daily IP limit hit – ip=${ip} count=${ipUsage.count}`);
        return json(
          { error: "Daily message limit reached. Please come back tomorrow." },
          429,
        );
      }
    } catch (e) {
      // Fail open, e.g. when the migration has not been applied to this DB yet.
      console.error("[philip] IP usage tracking failed, allowing request", e);
    }
  }

  console.log(
    `[philip] chat request – model=${model} turns=${history.length} lang=${lang}`,
  );

  // --- Condensation config ---
  const condenseModel = env.CONDENSE_MODEL || DEFAULT_CONDENSE_MODEL;
  const condenseThreshold = parsePositiveInt(env.CONDENSE_TOKEN_THRESHOLD) ?? 8000;
  const condenseCacheTtlSeconds = parsePositiveInt(env.CONDENSE_CACHE_TTL_SECONDS) ?? 300;
  const lastRequestAt =
    typeof body.lastRequestAt === "number" && body.lastRequestAt > 0
      ? body.lastRequestAt
      : undefined;
  const condensedSummary =
    typeof body.condensedSummary === "string" && body.condensedSummary.length > 0
      ? body.condensedSummary
      : undefined;

  const { response, pump } = streamChatResponse({
    history,
    apiKey: env.OPENROUTER_API_KEY,
    model,
    assetFetch: (path) => env.ASSETS.fetch(new URL(path, request.url)),
    referer: new URL(request.url).origin,
    title: "Philip",
    lang,
    condenseModel,
    condenseThreshold,
    condenseCacheTtlMs: condenseCacheTtlSeconds * 1000,
    lastRequestAt,
    condensedSummary,
  });

  context.waitUntil(
    pump.then(
      () => console.log("[philip] chat stream finished"),
      (err) => console.error("[philip] chat stream error:", err),
    ),
  );
  return response;
};
