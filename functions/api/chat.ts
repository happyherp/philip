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
  getConversation,
} from "../../src/db.ts";
import { streamChatResponse } from "../../src/chat.ts";
import { verifyTurnstileToken } from "../../src/turnstile.ts";
import { DEFAULT_LIMITS, recordIpUsage } from "../../src/rate-limit.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  TURNSTILE_SECRET_KEY?: string;
  MAX_MESSAGES_PER_CONVERSATION?: string;
  MAX_MESSAGES_PER_IP_PER_DAY?: string;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

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

  // Language: prefer explicit body param, fall back to Accept-Language header, default "en".
  const lang = resolveLang(
    typeof body.lang === "string" ? body.lang : null,
    request.headers.get("Accept-Language"),
  );

  if (!userMessage) {
    return json({ error: "message is required" }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP");

  // Resolve the conversation. A supplied id must exist — unknown ids are
  // rejected rather than silently recreated, otherwise any client could skip
  // bot verification by inventing an id.
  let priorMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const conv = await getConversation(env.DB, conversationId);
    if (!conv) {
      return json({ error: "Unknown conversation. Please start a new chat." }, 404);
    }
    priorMessages = conv.messages;
  }

  // --- Turnstile bot verification (skipped when secret is not configured) ---
  // Only required when starting a new conversation; messages in an existing
  // conversation already passed the challenge (tokens are single-use anyway)
  // and are bounded by the per-conversation cap below.
  if (env.TURNSTILE_SECRET_KEY && !conversationId) {
    const cfToken =
      typeof body.cfTurnstileToken === "string" ? body.cfTurnstileToken : "";
    if (!cfToken) {
      return json({ error: "Bot verification token is missing." }, 403);
    }
    const outcome = await verifyTurnstileToken(cfToken, env.TURNSTILE_SECRET_KEY, ip);
    if (outcome === "fail") {
      return json({ error: "Bot verification failed." }, 403);
    }
    if (outcome === "unavailable") {
      // Fail open: a Cloudflare hiccup must not block real users.
      console.warn("[philip] Turnstile siteverify unavailable, allowing request");
    }
  }

  // --- Usage caps (hard backstop, independent of Turnstile) ---
  const maxPerConversation =
    parsePositiveInt(env.MAX_MESSAGES_PER_CONVERSATION) ??
    DEFAULT_LIMITS.maxMessagesPerConversation;
  const maxPerIpPerDay =
    parsePositiveInt(env.MAX_MESSAGES_PER_IP_PER_DAY) ??
    DEFAULT_LIMITS.maxMessagesPerIpPerDay;

  const userTurns = priorMessages.filter((m) => m.role === "user").length;
  if (userTurns >= maxPerConversation) {
    return json(
      { error: "This conversation has reached its message limit. Please start a new chat." },
      429,
    );
  }

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
    // Fail open, e.g. when migration 0002 has not been applied to this DB yet.
    console.error("[philip] IP usage tracking failed, allowing request", e);
  }

  const convId = conversationId ?? (await createConversation(env.DB));
  await appendMessage(env.DB, convId, "user", userMessage);

  const historyForLLM = [...priorMessages, { role: "user" as const, content: userMessage }];

  console.log(
    `[philip] chat request – model=${model} conv=${convId} turns=${historyForLLM.length} lang=${lang}`,
  );

  const { response, pump } = streamChatResponse({
    history: historyForLLM,
    apiKey: env.OPENROUTER_API_KEY,
    model,
    assetFetch: (path) => env.ASSETS.fetch(new URL(path, request.url)),
    referer: new URL(request.url).origin,
    title: "Philip",
    conversationId: convId,
    lang,
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

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const SUPPORTED_LANGS = new Set(["en", "es", "de"]);

function resolveLang(bodyLang: string | null, acceptLanguage: string | null): string {
  if (bodyLang) {
    const base = bodyLang.split("-")[0].toLowerCase();
    if (SUPPORTED_LANGS.has(base)) return base;
  }
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const base = part.split(";")[0].trim().split("-")[0].toLowerCase();
      if (SUPPORTED_LANGS.has(base)) return base;
    }
  }
  return "en";
}
