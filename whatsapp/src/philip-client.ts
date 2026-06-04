export interface PhilipResponse {
  text: string;
  /** The conversation ID returned by the server (may be new if none was supplied). */
  conversationId: string | null;
}

export interface PhilipClient {
  sendMessage(message: string, conversationId?: string): Promise<PhilipResponse>;
}

export function createPhilipClient(baseUrl: string): PhilipClient {
  return {
    async sendMessage(message: string, conversationId?: string): Promise<PhilipResponse> {
      const payload: Record<string, string> = { message };
      if (conversationId) payload.conversationId = conversationId;

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Philip API responded ${response.status}: ${body}`);
      }

      const returnedConvId = response.headers.get("x-conversation-id");
      const text = await collectSSE(response);
      return { text, conversationId: returnedConvId };
    },
  };
}

/** Consume a text/event-stream response and return the concatenated assistant text. */
async function collectSSE(response: Response): Promise<string> {
  if (!response.body) throw new Error("Response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let data: unknown;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (typeof data !== "object" || data === null) continue;
      const d = data as Record<string, unknown>;
      if (typeof d.token === "string") fullText += d.token;
      if (typeof d.error === "string") throw new Error(`Philip error: ${d.error}`);
      if (d.done === true) return fullText;
    }
  }

  return fullText;
}
