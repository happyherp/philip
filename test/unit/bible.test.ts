import { describe, it, expect } from "vitest";
import {
  formatReference,
  getPassage,
  parseReference,
  passageToText,
} from "../../src/bible.ts";
import { fileAssetFetch } from "../helpers.ts";

describe("parseReference", () => {
  it("parses a single verse", () => {
    const r = parseReference("John 8:31")!;
    expect(r.book.name).toBe("John");
    expect(r).toMatchObject({ startChapter: 8, startVerse: 31, endChapter: 8, endVerse: 31 });
  });

  it("parses a same-chapter verse range", () => {
    expect(parseReference("John 8:31-32")).toMatchObject({
      startChapter: 8,
      startVerse: 31,
      endChapter: 8,
      endVerse: 32,
    });
  });

  it("parses a whole chapter", () => {
    expect(parseReference("Psalm 23")).toMatchObject({
      startChapter: 23,
      startVerse: undefined,
      endChapter: 23,
    });
  });

  it("parses numbered books with and without a space", () => {
    expect(parseReference("1 John 1:9")!.book.name).toBe("1 John");
    expect(parseReference("1John 1:9")!.book.name).toBe("1 John");
  });

  it("parses a cross-chapter range", () => {
    expect(parseReference("John 8:31-9:2")).toMatchObject({
      startChapter: 8,
      startVerse: 31,
      endChapter: 9,
      endVerse: 2,
    });
  });

  it("parses a chapter range", () => {
    expect(parseReference("John 8-9")).toMatchObject({
      startChapter: 8,
      startVerse: undefined,
      endChapter: 9,
    });
  });

  it("resolves aliases", () => {
    expect(parseReference("Ps 23")!.book.name).toBe("Psalms");
    expect(parseReference("Song of Songs 2:1")!.book.name).toBe("Song of Solomon");
    expect(parseReference("rev 22:21")!.book.name).toBe("Revelation");
  });

  it("rejects garbage", () => {
    expect(parseReference("")).toBeNull();
    expect(parseReference("hello there")).toBeNull();
    expect(parseReference("Nonexistent 1:1")).toBeNull();
    expect(parseReference("John")).toBeNull();
  });
});

describe("formatReference", () => {
  it("renders canonical strings", () => {
    expect(formatReference(parseReference("John 8:31")!)).toBe("John 8:31");
    expect(formatReference(parseReference("John 8:31-32")!)).toBe("John 8:31-32");
    expect(formatReference(parseReference("Psalm 23")!)).toBe("Psalms 23");
    expect(formatReference(parseReference("John 8:31-9:2")!)).toBe("John 8:31-9:2");
  });
});

describe("getPassage (against bundled WEB)", () => {
  const assets = fileAssetFetch();

  it("returns exact verse text", async () => {
    const p = await getPassage("John 8:31-32", assets);
    expect("verses" in p).toBe(true);
    if (!("verses" in p)) return;
    expect(p.reference).toBe("John 8:31-32");
    expect(p.translation).toBe("WEB");
    expect(p.verses).toHaveLength(2);
    expect(p.verses[0]).toMatchObject({ chapter: 8, verse: 31 });
    expect(p.verses[0].text).toContain("If you remain in my word");
    expect(p.verses[1].text).toContain("the truth will make you free");
  });

  it("returns a whole chapter", async () => {
    const p = await getPassage("Psalm 23", assets);
    if (!("verses" in p)) throw new Error("expected verses");
    expect(p.verses).toHaveLength(6);
    expect(p.verses[0].text).toContain("Yahweh is my shepherd");
  });

  it("reports a parse error for nonsense", async () => {
    const p = await getPassage("not a reference", assets);
    expect("error" in p).toBe(true);
  });

  it("reports not-found for an out-of-range verse", async () => {
    const p = await getPassage("John 999:1", assets);
    expect("error" in p).toBe(true);
  });

  it("fetches scholarly texts by translation id", async () => {
    const greek = await getPassage("John 1:1", assets, "tisch");
    if (!("verses" in greek)) throw new Error("expected verses");
    expect(greek.translation).toBe("Tischendorf");
    expect(greek.verses[0].text).toContain("λόγος");

    const hebrew = await getPassage("Genesis 1:1", assets, "wlc");
    if (!("verses" in hebrew)) throw new Error("expected verses");
    expect(hebrew.verses[0].text).toContain("בָּרָ֣א");
  });

  it("rejects an unknown translation id with the list of valid ids", async () => {
    const p = await getPassage("John 1:1", assets, "kjv");
    if (!("error" in p)) throw new Error("expected error");
    expect(p.error).toContain('Unknown translation "kjv"');
    expect(p.error).toContain("web");
    expect(p.error).toContain("tisch");
  });

  it("explains coverage and suggests an alternative for uncovered books", async () => {
    const otInGreekNt = await getPassage("Genesis 1:1", assets, "tisch");
    if (!("error" in otInGreekNt)) throw new Error("expected error");
    expect(otInGreekNt.error).toContain("does not contain Genesis");
    expect(otInGreekNt.error).toContain("wlc");
    expect(otInGreekNt.error).toContain("lxx");

    const ntInHebrew = await getPassage("John 1:1", assets, "wlc");
    if (!("error" in ntInHebrew)) throw new Error("expected error");
    expect(ntInHebrew.error).toContain("does not contain John");
    expect(ntInHebrew.error).toContain("tisch");
  });

  it("renders passage text for the model", async () => {
    const p = await getPassage("John 8:32", assets);
    if (!("verses" in p)) throw new Error("expected verses");
    expect(passageToText(p)).toContain("John 8:32 (WEB)");
    expect(passageToText(p)).toContain("8:32 You will know the truth");
  });
});
