// Guards the JS port in public/frontend/quotes.js against drifting from the
// canonical TypeScript parser in src/bible.ts (both sides also share the
// generated book/translation data via scripts/gen-frontend-data.ts).
import { describe, expect, it } from "vitest";
import { parseReference as parseTs } from "../../src/bible.ts";
import { parseReference as parseJs } from "../../public/frontend/quotes.js";

const REFERENCES = [
  "John 8:31",
  "John 8:31-32",
  "John 8:31-9:2",
  "John 8-9",
  "Psalm 23",
  "1 John 1:9",
  "1John 1:9",
  "Song of Songs 2:1",
  "rev 22:21",
  "Juan 8:31",
  "Johannes 8:31",
  "1. Mose 1:1",
  "Salmos 23:1",
  "Hld 2:1",
  "not a reference",
  "Nonexistent 1:1",
  "",
];

describe("parseReference parity (src/bible.ts vs public/frontend/quotes.js)", () => {
  for (const ref of REFERENCES) {
    it(`agrees on ${JSON.stringify(ref)}`, () => {
      const ts = parseTs(ref);
      const js = parseJs(ref);
      if (ts === null || js === null) {
        expect(js).toBe(ts);
        return;
      }
      expect(js.book.name).toBe(ts.book.name);
      expect(js.book.file).toBe(ts.book.file);
      expect({
        startChapter: js.startChapter,
        startVerse: js.startVerse,
        endChapter: js.endChapter,
        endVerse: js.endVerse,
      }).toEqual({
        startChapter: ts.startChapter,
        startVerse: ts.startVerse,
        endChapter: ts.endChapter,
        endVerse: ts.endVerse,
      });
    });
  }
});
