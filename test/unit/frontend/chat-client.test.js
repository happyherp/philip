import { describe, it, expect, vi } from "vitest";
import { streamChat } from "../../../public/frontend/chat-client.js";
import { doneEvent, errorEvent, sseResponse, tokenEvent } from "../../helpers.js";

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
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("500"));
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
