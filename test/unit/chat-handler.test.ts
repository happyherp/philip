import { describe, it, expect } from "vitest";
import { sanitizeHistory, streamChatResponse } from "../../src/chat.ts";
import { DONE, contentEvent, fetchSequence, fileAssetFetch, sseResponse } from "../helpers.ts";

async function readSSE(res: Response): Promise<string> {
  return await res.text();
}

describe("sanitizeHistory", () => {
  it("keeps only well-formed user/assistant turns", () => {
    const out = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "system", content: "ignore me" },
      { role: "user", content: 123 },
      "garbage",
      null,
    ]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizeHistory(undefined)).toEqual([]);
    expect(sanitizeHistory({})).toEqual([]);
  });
});

describe("streamChatResponse", () => {
  it("streams token and done events as SSE", async () => {
    const { fetchImpl } = fetchSequence([
      sseResponse([contentEvent("Peace "), contentEvent("be with you."), DONE]),
    ]);
    const { response, pump } = streamChatResponse({
      history: [{ role: "user", content: "hi" }],
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    // Drain the stream concurrently with the pump (the client does this in prod).
    const body = await readSSE(response);
    await pump;
    expect(body).toContain('data: {"token":"Peace "}');
    expect(body).toContain('data: {"token":"be with you."}');
    expect(body).toContain('data: {"done":true}');
  });

  it("emits an error event when history is empty", async () => {
    const { fetchImpl } = fetchSequence([]);
    const { response, pump } = streamChatResponse({
      history: [],
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
    });
    const body = await readSSE(response);
    await pump;
    expect(body).toContain('"error"');
  });

  it("emits an error event when the upstream fails", async () => {
    const { fetchImpl } = fetchSequence([new Response("no", { status: 500 })]);
    const { response, pump } = streamChatResponse({
      history: [{ role: "user", content: "hi" }],
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
    });
    const body = await readSSE(response);
    await pump;
    expect(body).toContain('"error"');
    expect(body).toContain("HTTP 500");
  });
});
