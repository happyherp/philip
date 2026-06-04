import { describe, it, expect } from "vitest";
import {
  addMessage,
  appendToken,
  createState,
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
});
