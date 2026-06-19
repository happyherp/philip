import { describe, it, expect } from "vitest";
import {
  addRecord,
  fallbackTitle,
  makeRecord,
  newId,
  removeRecord,
  renameRecord,
  sanitizeList,
} from "../../../public/frontend/conversations.js";

const msgs = [
  { role: "user", content: "Tell me about John 3:16" },
  { role: "assistant", content: "For God so loved the world…" },
];

describe("saved-conversations store", () => {
  it("mints unique ids", () => {
    expect(newId()).not.toBe(newId());
  });

  it("drops malformed entries from storage", () => {
    const list = sanitizeList([
      null,
      { messages: [] },
      { id: "a", title: "t", summary: "s", messages: msgs, lang: "en", createdAt: 1 },
      "nope",
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("a");
  });

  it("backfills missing fields when sanitizing", () => {
    const [c] = sanitizeList([{ messages: msgs }]);
    expect(typeof c.id).toBe("string");
    expect(c.title).toBe("");
    expect(c.lang).toBe("en");
    expect(typeof c.createdAt).toBe("number");
  });

  it("falls back to the first user turn for a title", () => {
    expect(fallbackTitle(msgs)).toBe("Tell me about John 3:16");
    expect(fallbackTitle([])).toBe("");
  });

  it("truncates a long fallback title", () => {
    const long = [{ role: "user", content: "a".repeat(80) }];
    expect(fallbackTitle(long).endsWith("…")).toBe(true);
    expect(fallbackTitle(long).length).toBeLessThanOrEqual(41);
  });

  it("makeRecord uses the generated title, or falls back", () => {
    const a = makeRecord({ messages: msgs, lang: "en", title: "John 3", summary: "John 3:16" });
    expect(a.title).toBe("John 3");
    expect(a.summary).toBe("John 3:16");

    const b = makeRecord({ messages: msgs, lang: "en", title: "  ", summary: "" });
    expect(b.title).toBe("Tell me about John 3:16");
  });

  it("adds newest-first, renames, and removes", () => {
    const r1 = makeRecord({ messages: msgs, lang: "en", title: "one", summary: "" });
    const r2 = makeRecord({ messages: msgs, lang: "en", title: "two", summary: "" });
    let list = addRecord([], r1);
    list = addRecord(list, r2);
    expect(list.map((c) => c.title)).toEqual(["two", "one"]);

    list = renameRecord(list, r1.id, "renamed");
    expect(list.find((c) => c.id === r1.id).title).toBe("renamed");

    // Empty rename keeps the old title.
    list = renameRecord(list, r1.id, "   ");
    expect(list.find((c) => c.id === r1.id).title).toBe("renamed");

    list = removeRecord(list, r2.id);
    expect(list.map((c) => c.id)).toEqual([r1.id]);
  });
});
