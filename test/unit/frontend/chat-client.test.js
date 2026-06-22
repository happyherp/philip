import { describe, it, expect, vi } from "vitest";
import { streamChat } from "../../../public/frontend/chat-client.js";
import { doneEvent, errorEvent, sseResponse, statusEvent, tokenEvent } from "../../helpers.js";

describe("streamChat", () => {
  it("sends messages and streams tokens, then completes once", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([tokenEvent("Peace "), tokenEvent("be with you."), doneEvent]),
    );
    const tokens = [];
    const onDone = vi.fn();

    await streamChat({
      messages: [{ role: "user", content: "hi" }],
      onToken: (t) => tokens.push(t),
      onDone,
      fetchImpl,
    });

    expect(tokens).toEqual(["Peace ", "be with you."]);
    expect(onDone).toHaveBeenCalledTimes(1);

    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: "user", content: "hi" }] });
  });

  it("delivers status events to onStatus", async () => {
    const status = { type: "reading", reference: "John 3", translation: "WEB" };
    const fetchImpl = vi.fn(async () =>
      sseResponse([statusEvent(status), tokenEvent("For God so loved…"), doneEvent]),
    );
    const statuses = [];
    const tokens = [];

    await streamChat({
      messages: [{ role: "user", content: "Read John 3" }],
      onToken: (t) => tokens.push(t),
      onStatus: (s) => statuses.push(s),
      fetchImpl,
    });

    expect(statuses).toEqual([status]);
    expect(tokens).toEqual(["For God so loved…"]);
  });

  it("surfaces server error events", async () => {
    const fetchImpl = vi.fn(async () => sseResponse([errorEvent("boom")]));
    const onError = vi.fn();
    const onDone = vi.fn();

    await streamChat({
      messages: [{ role: "user", content: "hi" }],
      onToken: () => {},
      onError,
      onDone,
      fetchImpl,
    });

    expect(onError).toHaveBeenCalledWith("boom");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("handles a non-OK response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const onError = vi.fn();
    await streamChat({
      messages: [{ role: "user", content: "hi" }],
      onToken: () => {},
      onError,
      fetchImpl,
    });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("500"), {
      status: 500,
      code: undefined,
    });
  });

  it("surfaces the server's JSON error message and code on non-OK responses", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "Daily message limit reached.", code: "rate_limited" }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
    );
    const onError = vi.fn();
    await streamChat({
      messages: [{ role: "user", content: "hi" }],
      onToken: () => {},
      onError,
      fetchImpl,
    });
    expect(onError).toHaveBeenCalledWith("Daily message limit reached.", {
      status: 429,
      code: "rate_limited",
    });
  });

  it("handles a network rejection", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const onError = vi.fn();
    await streamChat({
      messages: [{ role: "user", content: "hi" }],
      onToken: () => {},
      onError,
      fetchImpl,
    });
    expect(onError).toHaveBeenCalledWith("offline");
  });
});
