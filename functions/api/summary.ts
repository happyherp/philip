// Cloudflare Pages Function: POST /api/summary
// Distils a finished conversation into a short title and a one-line summary that
// references the significant Bible verses last discussed. Used by the browser
// when it archives the current conversation into its saved-conversations list.
//
//   POST { messages: [{ role, content }], lang? }  ->  { title, summary }
//
// Like /api/chat, the conversation is owned by the browser and sent each call;
// the server persists nothing here.

import { summarizeConversation } from "../../src/summary.ts";
import { sanitizeHistory } from "../../src/messages.ts";
import { DEFAULT_LIMITS, recordIpUsage } from "../../src/rate-limit.ts";
import { clientIp, json, parsePositiveInt, resolveLang } from "../../src/http.ts";

interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const history = sanitizeHistory(body.messages);
  if (history.length === 0) {
    return json({ error: "Nothing to summarise." }, 400);
  }

  const lang = resolveLang(
    typeof body.lang === "string" ? body.lang : null,
    request.headers.get("Accept-Language"),
  );

  // Summarising draws from the same per-IP/day budget as chatting and sharing.
  if (env.DB) {
    const maxPerIpPerDay =
      parsePositiveInt(env.MAX_MESSAGES_PER_IP_PER_DAY) ??
      DEFAULT_LIMITS.maxMessagesPerIpPerDay;
    try {
      const usage = await recordIpUsage(env.DB, clientIp(request), maxPerIpPerDay);
      if (!usage.allowed) {
        return json({ error: "Daily limit reached. Please come back tomorrow." }, 429);
      }
    } catch (e) {
      console.error("[philip] summary IP usage tracking failed, allowing request", e);
    }
  }

  try {
    const { title, summary } = await summarizeConversation(history, {
      apiKey: env.OPENROUTER_API_KEY,
      model,
      referer: new URL(request.url).origin,
      title: "Philip",
      lang,
    });
    return json({ title, summary }, 200);
  } catch (e) {
    console.error("[philip] summary generation failed", e);
    return json({ error: "Could not summarise the conversation." }, 502);
  }
};
