import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import * as path from "path";
import * as dotenv from "dotenv";

import { createPhilipClient } from "./philip-client.js";
import { SessionStore } from "./session-store.js";

dotenv.config();

const PHILIP_API_URL = process.env.PHILIP_API_URL || "http://localhost:8788";
const DATA_DIR = process.env.DATA_DIR || ".";

const sessions = new SessionStore(path.join(DATA_DIR, "sessions.json"));
const philip = createPhilipClient(PHILIP_API_URL);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(DATA_DIR, ".wwebjs_auth") }),
  puppeteer: {
    // Required in headless Linux environments (e.g. Docker, VPS).
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("\n[philip-wa] Scan this QR code in WhatsApp > Linked Devices:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("[philip-wa] WhatsApp client ready — listening for messages");
});

client.on("auth_failure", (msg) => {
  console.error("[philip-wa] Authentication failure:", msg);
  process.exit(1);
});

client.on("disconnected", (reason) => {
  console.warn("[philip-wa] Disconnected:", reason);
  // Re-initialize so the process stays alive and reconnects automatically.
  client.initialize();
});

client.on("message", async (msg) => {
  // Ignore group chats, broadcasts, and status updates.
  if (msg.isGroupMsg) return;
  if (msg.from === "status@broadcast") return;

  const text = msg.body.trim();
  if (!text) return;

  const phone = msg.from; // e.g. "15551234567@c.us"
  const conversationId = sessions.get(phone);

  console.log(`[philip-wa] ${phone} → "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`);

  const chat = await msg.getChat();
  try {
    await chat.sendStateTyping();
    const result = await philip.sendMessage(text, conversationId);

    if (result.conversationId && result.conversationId !== conversationId) {
      sessions.set(phone, result.conversationId);
      console.log(`[philip-wa] New conversation for ${phone}: ${result.conversationId}`);
    }

    const reply = formatForWhatsApp(result.text);
    await msg.reply(reply);
  } catch (err) {
    console.error("[philip-wa] Error handling message:", err);
    await msg.reply("Something went wrong on my end. Please try again in a moment.");
  } finally {
    await chat.clearState();
  }
});

/**
 * Convert the markdown Philip uses into WhatsApp-compatible formatting.
 * WhatsApp supports: *bold*, _italic_, ~strikethrough~, ```mono```.
 * Headers and horizontal rules become plain text.
 */
function formatForWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // strip heading markers
    .replace(/\*\*(.*?)\*\*/g, "*$1*") // **bold** → *bold*
    .replace(/__(.*?)__/g, "_$1_") // __italic__ → _italic_
    .replace(/^[-*_]{3,}\s*$/gm, "─────────────") // horizontal rule
    .replace(/\n{3,}/g, "\n\n") // collapse excessive blank lines
    .trim();
}

console.log("[philip-wa] Initialising WhatsApp client…");
client.initialize();
