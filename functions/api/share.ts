// POST /api/share
// Explicit, opt-in sharing. Stores a snapshot of the conversation the reader
// chose to share and returns a short id. Conversations are NOT stored
// automatically — this is the only path that persists message content, and
// the snapshot expires (see migrations/0003).

import { createShare } from "../../src/db.ts";
import { sanitizeHistory } from "../../src/messages.ts";
import { DEFAULT_LIMITS, recordIpUsage } from "../../src/rate-limit.ts";
import { clientIp, json, parsePositiveInt, resolveLang } from "../../src/http.ts";

interface Env {
  DB: D1Database;
  MAX_MESSAGES_PER_IP_PER_DAY?: string;
}

// Guard rails so a public write endpoint can't be abused as free storage.
const MAX_SHARE_MESSAGES = 1000;
const MAX_SHARE_BYTES = 256 * 1024;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: "Sharing is not available." }, 503);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const messages = sanitizeHistory(body.messages);
  if (messages.length === 0) {
    return json({ error: "Nothing to share yet." }, 400);
  }
  if (messages.length > MAX_SHARE_MESSAGES) {
    return json({ error: "This conversation is too long to share." }, 413);
  }

  const bytes = new TextEncoder().encode(JSON.stringify(messages)).length;
  if (bytes > MAX_SHARE_BYTES) {
    return json({ error: "This conversation is too large to share." }, 413);
  }

  const lang = resolveLang(typeof body.lang === "string" ? body.lang : null);

  // Sharing draws from the same per-IP/day budget as chatting.
  const maxPerIpPerDay =
    parsePositiveInt(env.MAX_MESSAGES_PER_IP_PER_DAY) ??
    DEFAULT_LIMITS.maxMessagesPerIpPerDay;
  try {
    const usage = await recordIpUsage(env.DB, clientIp(request), maxPerIpPerDay);
    if (!usage.allowed) {
      return json({ error: "Daily limit reached. Please come back tomorrow." }, 429);
    }
  } catch (e) {
    console.error("[philip] share IP usage tracking failed, allowing request", e);
  }

  const { id, expiresAt } = await createShare(env.DB, messages, lang);
  const url = new URL(request.url);
  const shareUrl = `${url.origin}/?c=${id}`;
  return json({ id, url: shareUrl, expiresAt }, 201);
};
