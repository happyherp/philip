import { describe, expect, it } from "vitest";
import { convertGetBible, type GetBibleSource } from "../../scripts/build-bible-originals.ts";

function verse(verse: number, text: string) {
  return { verse, text };
}

describe("convertGetBible", () => {
  it("maps books by canon number, not array position", () => {
    const source: GetBibleSource = {
      translation: "NT Tischendorf 8th Ed",
      books: [
        {
          nr: 43, // John — first in the array, but must not become Genesis
          name: "Κατά Ιωάννην",
          chapters: [{ chapter: 1, verses: [verse(1, "Ἐν ἀρχῇ ἦν ὁ λόγος")] }],
        },
        {
          nr: 66,
          name: "Αποκάλυψις",
          chapters: [{ chapter: 1, verses: [verse(1, "Ἀποκάλυψις Ἰησοῦ Χριστοῦ")] }],
        },
      ],
    };
    const books = convertGetBible(source, "Tischendorf");
    expect(books.map((b) => b.compact.book)).toEqual(["John", "Revelation"]);
    expect(books[0].meta.file).toBe("john");
    expect(books[0].compact.translation).toBe("Tischendorf");
    expect(books[0].compact.chapters["1"]["1"]).toBe("Ἐν ἀρχῇ ἦν ὁ λόγος");
  });

  it("skips deuterocanonical books (nr outside 1-66) and books without nr", () => {
    const source: GetBibleSource = {
      translation: "OT LXX Accented",
      books: [
        { nr: 1, name: "Genesis", chapters: [{ chapter: 1, verses: [verse(1, "ἐν ἀρχῇ")] }] },
        { nr: 69, name: "Tobit", chapters: [{ chapter: 1, verses: [verse(1, "βίβλος λόγων")] }] },
        { nr: null, name: "Odes", chapters: [{ chapter: 1, verses: [verse(1, "ᾄσωμεν")] }] },
      ],
    };
    const books = convertGetBible(source, "LXX");
    expect(books.map((b) => b.compact.book)).toEqual(["Genesis"]);
  });

  it("drops empty verses and books that end up with no content", () => {
    const source: GetBibleSource = {
      translation: "test",
      books: [
        {
          nr: 1,
          name: "Genesis",
          chapters: [{ chapter: 1, verses: [verse(1, "   "), verse(2, "real text")] }],
        },
        { nr: 2, name: "Exodus", chapters: [{ chapter: 1, verses: [verse(1, "")] }] },
      ],
    };
    const books = convertGetBible(source, "T");
    expect(books).toHaveLength(1);
    expect(books[0].compact.chapters["1"]).toEqual({ "2": "real text" });
  });

  it("strips stray markup and collapses whitespace", () => {
    const source: GetBibleSource = {
      translation: "test",
      books: [
        {
          nr: 19,
          name: "Psalms",
          chapters: [{ chapter: 1, verses: [verse(1, "μακάριος <n>note</n>  ἀνήρ # ὃς ")] }],
        },
      ],
    };
    const books = convertGetBible(source, "LXX");
    expect(books[0].compact.chapters["1"]["1"]).toBe("μακάριος note ἀνήρ ὃς");
  });
});
