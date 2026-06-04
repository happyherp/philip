// WhatsApp Cloud API client (Meta's direct API).
// Handles webhook payload parsing, outbound messaging, and text formatting.

export interface WaTextMessage {
  from: string;
  id: string;
  text: { body: string };
  type: "text";
  timestamp: string;
}

export interface WaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string; display_phone_number: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<WaTextMessage | { type: string; from: string; id: string }>;
      };
      field: string;
    }>;
  }>;
}

export interface InboundTextMessage {
  from: string;
  text: string;
  phoneNumberId: string;
}

/** Extract the first text message from a webhook payload, or null. */
export function extractTextMessage(payload: WaWebhookPayload): InboundTextMessage | null {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const { messages, metadata } = change.value;
      if (!messages?.length) continue;
      for (const msg of messages) {
        if (msg.type === "text" && "text" in msg) {
          return {
            from: msg.from,
            text: (msg as WaTextMessage).text.body,
            phoneNumberId: metadata.phone_number_id,
          };
        }
      }
    }
  }
  return null;
}

/** Send a text message via WhatsApp Cloud API. */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp API error: HTTP ${res.status} ${detail}`.trim());
  }
}

/**
 * Convert Markdown to WhatsApp-compatible text.
 * WhatsApp supports *bold*, _italic_, ~strikethrough~, `mono` but not ## headers or **bold**.
 */
export function markdownToWhatsApp(md: string): string {
  return md
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")       // ## Heading → *Heading*
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")           // **bold** → *bold*
    .replace(/__(.+?)__/gs, "*$1*")               // __bold__ → *bold*
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")      // [text](url) → text
    .replace(/\n{3,}/g, "\n\n")                   // collapse excess blank lines
    .trim();
}

/** Split a long message at paragraph or line boundaries, respecting WhatsApp's 4096-char limit. */
export function splitMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen / 2) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
