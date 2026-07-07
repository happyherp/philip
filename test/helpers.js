// Shared test helpers (frontend/jsdom).

/** Build a streaming SSE Response from raw wire strings. */
export function sseResponse(chunks, status = 200) {
  const body = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

export function tokenEvent(text) {
  return `data: ${JSON.stringify({ token: text })}\n\n`;
}
export function errorEvent(message, extra = {}) {
  return `data: ${JSON.stringify({ error: message, ...extra })}\n\n`;
}
export function statusEvent(status) {
  return `data: ${JSON.stringify({ status })}\n\n`;
}
export const doneEvent = `data: ${JSON.stringify({ done: true })}\n\n`;
