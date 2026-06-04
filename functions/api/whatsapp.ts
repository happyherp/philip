// Cloudflare Pages Function: GET + POST /api/whatsapp
//
// GET  – Meta webhook verification (responds to hub.challenge)
// POST – Incoming WhatsApp messages → Philip → reply via Meta Graph API
//
// Required secrets (set via `wrangler pages secret put`):
//   WHATSAPP_TOKEN         – Permanent system-user access token from Meta
//   WHATSAPP_VERIFY_TOKEN  – Arbitrary string you set in the Meta webhook config

import {
  appendMessage,
  getConversationMessages,
  getOrCreateWhatsAppSession,
} from "../../src/db.ts";
import { runChat } from "../../src/openrouter.ts";
import {
  extractTextMessage,
  markdownToWhatsApp,
  sendWhatsAppMessage,
  splitMessage,
} from "../../src/whatsapp.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_VERIFY_TOKEN: string;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";

/** Meta calls GET to verify the webhook endpoint. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
};

/** Meta POSTs each incoming message here. Must respond 200 quickly or Meta retries. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  context.waitUntil(handleInbound(payload, request, env));

  return new Response("OK", { status: 200 });
};

async function handleInbound(payload: any, request: Request, env: Env): Promise<void> {
  const msg = extractTextMessage(payload);
  if (!msg) return; // read receipts, status updates, non-text messages

  const { from, text, phoneNumberId } = msg;
  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;

  console.log(`[philip/whatsapp] message from=${from} len=${text.length}`);

  const convId = await getOrCreateWhatsAppSession(env.DB, from);
  const priorMessages = await getConversationMessages(env.DB, convId);

  await appendMessage(env.DB, convId, "user", text);

  const history = [...priorMessages, { role: "user" as const, content: text }];

  let finalText: string;
  try {
    finalText = await runChat(history, {
      apiKey: env.OPENROUTER_API_KEY,
      model,
      assetFetch: (path) => env.ASSETS.fetch(new URL(path, request.url)),
      referer: new URL(request.url).origin,
      title: "Philip",
      onToken: () => {},
    });
  } catch (err) {
    console.error("[philip/whatsapp] runChat error:", err);
    await sendWhatsAppMessage(
      phoneNumberId,
      from,
      "Sorry, something went wrong. Please try again.",
      env.WHATSAPP_TOKEN,
    ).catch((e) => console.error("[philip/whatsapp] error sending error reply:", e));
    return;
  }

  await appendMessage(env.DB, convId, "assistant", finalText).catch((e) =>
    console.error("[philip/whatsapp] failed to persist assistant message:", e),
  );

  const chunks = splitMessage(markdownToWhatsApp(finalText));
  for (const chunk of chunks) {
    await sendWhatsAppMessage(phoneNumberId, from, chunk, env.WHATSAPP_TOKEN).catch((e) =>
      console.error("[philip/whatsapp] failed to send chunk:", e),
    );
  }
}
