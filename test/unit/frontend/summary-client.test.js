import { describe, it, expect, vi } from "vitest";
import { summarizeConversation } from "../../../public/frontend/summary-client.js";

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

describe("summarizeConversation (client)", () => {
  it("posts the conversation and returns title + summary", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ title: "Loved the world", summary: "Discussed John 3:16." }),
    );
    const out = await summarizeConversation({
      messages: [{ role: "user", content: "hi" }],
      lang: "en",
      fetchImpl,
    });
    expect(out).toEqual({ title: "Loved the world", summary: "Discussed John 3:16." });

    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ role: "user", content: "hi" }],
      lang: "en",
    });
  });

  it("returns empty strings on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "boom" }, false));
    expect(await summarizeConversation({ messages: [], fetchImpl })).toEqual({
      title: "",
      summary: "",
    });
  });

  it("returns empty strings when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await summarizeConversation({ messages: [], fetchImpl })).toEqual({
      title: "",
      summary: "",
    });
  });
});
