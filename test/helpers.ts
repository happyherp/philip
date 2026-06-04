// Shared test helpers (backend/node).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetFetch } from "../src/bible.ts";

/** An AssetFetch backed by the real generated files under public/. */
export function fileAssetFetch(): AssetFetch {
  return async (path: string) => {
    try {
      const buf = await readFile(join(process.cwd(), "public", path));
      return new Response(buf, { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  };
}

/** Build a streaming SSE Response from raw wire strings. */
export function sseResponse(chunks: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

/** One SSE `data:` line for a content token. */
export function contentEvent(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/** One SSE `data:` line for a (possibly partial) tool-call fragment. */
export function toolEvent(
  index: number,
  frag: { id?: string; name?: string; arguments?: string },
): string {
  const fn: Record<string, string> = {};
  if (frag.name) fn.name = frag.name;
  if (frag.arguments) fn.arguments = frag.arguments;
  const tool: Record<string, unknown> = { index, function: fn };
  if (frag.id) tool.id = frag.id;
  return `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [tool] } }] })}\n\n`;
}

export const DONE = "data: [DONE]\n\n";

/** A fetch mock that returns the given Responses in order. */
export function fetchSequence(responses: Response[]): {
  fetchImpl: typeof fetch;
  bodies: () => Promise<any[]>;
} {
  const calls: RequestInit[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {});
    const res = responses[i++];
    if (!res) throw new Error("fetchSequence: no more responses queued");
    return res;
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    bodies: async () => calls.map((c) => JSON.parse(String(c.body))),
  };
}
