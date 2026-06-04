// Cloudflare Pages Function: POST /api/whatsapp
// Twilio webhook for WhatsApp messages. Verifies the request signature,
// persists the user turn, runs Philip, and returns a TwiML <Message> reply.

import {
  appendMessage,
  getConversationMessages,
  getOrCreateWhatsAppConversation,
} from "../../src/db.ts";
import { runChat } from "../../src/openrouter.ts";
import { verifyTwilioSignature } from "../../src/twilio.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  TWILIO_AUTH_TOKEN: string;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
// WhatsApp allows up to 4096 chars; leave a small buffer.
const MAX_REPLY_CHARS = 4000;
// Must reply before Twilio's 15-second webhook timeout.
const REPLY_TIMEOUT_MS = 12_000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.TWILIO_AUTH_TOKEN) {
    console.error("[philip/whatsapp] TWILIO_AUTH_TOKEN is not set");
    return twiml("");
  }

  const valid = await verifyTwilioSignature(request.clone(), env.TWILIO_AUTH_TOKEN);
  if (!valid) {
    return new Response("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const from = form.get("From"); // e.g. "whatsapp:+1234567890"
  const body = typeof form.get("Body") === "string" ? (form.get("Body") as string).trim() : "";

  if (typeof from !== "string" || !from || !body) {
    return twiml(""); // nothing to reply to
  }

  if (!env.OPENROUTER_API_KEY) {
    console.error("[philip/whatsapp] OPENROUTER_API_KEY is not set");
    return twiml("Sorry, I'm not available right now. Please try again later.");
  }

  const convId = await getOrCreateWhatsAppConversation(env.DB, from);
  const priorMessages = await getConversationMessages(env.DB, convId);
  await appendMessage(env.DB, convId, "user", body);

  const historyForLLM = [...priorMessages, { role: "user" as const, content: body }];

  console.log(
    `[philip/whatsapp] from=${from} conv=${convId} turns=${historyForLLM.length}`,
  );

  let replyText: string;
  try {
    replyText = await Promise.race([
      runChat(historyForLLM, {
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
        assetFetch: (path) => env.ASSETS.fetch(new URL(path, request.url)),
        referer: new URL(request.url).origin,
        title: "Philip",
        onToken: () => {},
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Reply timeout after " + REPLY_TIMEOUT_MS + "ms")),
          REPLY_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    console.error("[philip/whatsapp] runChat error:", err);
    return twiml("I'm having trouble responding right now. Please try again in a moment.");
  }

  const trimmed = replyText.trim();
  if (trimmed) {
    await appendMessage(env.DB, convId, "assistant", trimmed).catch((e) =>
      console.error("[philip/whatsapp] failed to persist assistant reply", e),
    );
  }

  const reply =
    trimmed.length > MAX_REPLY_CHARS ? trimmed.slice(0, MAX_REPLY_CHARS - 1) + "…" : trimmed;

  return twiml(reply);
};

function twiml(message: string): Response {
  const content = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`,
    { headers: { "content-type": "text/xml; charset=utf-8" } },
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
