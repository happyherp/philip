import { describe, it, expect } from "vitest";
import {
  addMessage,
  appendToken,
  createState,
  insertRead,
  toHistory,
} from "../../../public/frontend/state.js";

describe("conversation state", () => {
  it("adds messages and returns them", () => {
    const s = createState();
    expect(s.messages).toEqual([]);
    const m = addMessage(s, "user", "hello");
    expect(m).toEqual({ role: "user", content: "hello" });
    expect(s.messages).toHaveLength(1);
  });

  it("appends streamed tokens to the last message", () => {
    const s = createState();
    addMessage(s, "user", "hi");
    addMessage(s, "assistant", "");
    appendToken(s, "Pe");
    appendToken(s, "ace");
    expect(s.messages[1].content).toBe("Peace");
  });

  it("throws if appending with no messages", () => {
    expect(() => appendToken(createState(), "x")).toThrow();
  });

  it("produces a clean history payload", () => {
    const s = createState();
    addMessage(s, "user", "a");
    addMessage(s, "assistant", "b");
    expect(toHistory(s)).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("inserts read notes before the assistant turn and keeps them out of history", () => {
    const s = createState();
    addMessage(s, "user", "Read John 3");
    const assistant = addMessage(s, "assistant", "");
    insertRead(s, "John 3", "WEB", assistant);
    insertRead(s, "John 3:16", "WEB", assistant);

    // Reads sit before the answer, in order.
    expect(s.messages.map((m) => m.role)).toEqual([
      "user",
      "read",
      "read",
      "assistant",
    ]);
    expect(s.messages[1]).toEqual({ role: "read", reference: "John 3", translation: "WEB" });

    // The model never sees the read notes.
    expect(toHistory(s)).toEqual([
      { role: "user", content: "Read John 3" },
      { role: "assistant", content: "" },
    ]);
  });

  it("appends a read note at the end when there is no assistant turn yet", () => {
    const s = createState();
    addMessage(s, "user", "Read John 3");
    insertRead(s, "John 3", "WEB", null);
    expect(s.messages.map((m) => m.role)).toEqual(["user", "read"]);
  });
});
