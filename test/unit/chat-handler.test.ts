import { describe, it, expect } from "vitest";
import { sanitizeHistory, streamChatResponse } from "../../src/chat.ts";
import { DONE, contentEvent, fetchSequence, fileAssetFetch, sseResponse, toolEvent } from "../helpers.ts";

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

  it("emits a lang event for reader translations but not scholarly ones", async () => {
    const passageCall = (translation: string) =>
      sseResponse([
        toolEvent(0, {
          id: "call1",
          name: "get_passage",
          arguments: JSON.stringify({ reference: "John 1:1", translation }),
        }),
        DONE,
      ]);

    // Greek word study: no lang event.
    {
      const { fetchImpl } = fetchSequence([
        passageCall("tisch"),
        sseResponse([contentEvent("done"), DONE]),
      ]);
      const { response, pump } = streamChatResponse({
        history: [{ role: "user", content: "hi" }],
        apiKey: "test",
        model: "test/model",
        fetchImpl,
        assetFetch: fileAssetFetch(),
      });
      const body = await readSSE(response);
      await pump;
      expect(body).not.toContain('"lang"');
    }

    // Spanish reading: lang event fires.
    {
      const { fetchImpl } = fetchSequence([
        passageCall("rv1909"),
        sseResponse([contentEvent("hecho"), DONE]),
      ]);
      const { response, pump } = streamChatResponse({
        history: [{ role: "user", content: "hola" }],
        apiKey: "test",
        model: "test/model",
        fetchImpl,
        assetFetch: fileAssetFetch(),
      });
      const body = await readSSE(response);
      await pump;
      expect(body).toContain('data: {"lang":"es"}');
    }
  });

  it("emits a status event naming the passage and translation being read", async () => {
    const { fetchImpl } = fetchSequence([
      sseResponse([
        toolEvent(0, {
          id: "call1",
          name: "get_passage",
          arguments: JSON.stringify({ reference: "john 3" }),
        }),
        DONE,
      ]),
      sseResponse([contentEvent("done"), DONE]),
    ]);
    const { response, pump } = streamChatResponse({
      history: [{ role: "user", content: "Read John 3" }],
      apiKey: "test",
      model: "test/model",
      fetchImpl,
      assetFetch: fileAssetFetch(),
    });
    const body = await readSSE(response);
    await pump;
    expect(body).toContain(
      'data: {"status":{"type":"reading","reference":"John 3","translation":"WEB"}}',
    );
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
