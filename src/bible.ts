// Reference parsing + passage lookup against the bundled WEB JSON.
// Pure and dependency-injected: callers pass an `assetFetch` so this works
// identically in the Cloudflare Worker (env.ASSETS), in Node tests (a stub),
// and in a future WhatsApp webhook.

import { type BookMeta, buildBookIndex, normalizeBookKey } from "./books.ts";

const BOOK_INDEX = buildBookIndex();

/** Max verses a single lookup may return (longest chapter, Ps 119, is 176). */
export const MAX_VERSES = 200;

export interface ParsedReference {
  book: BookMeta;
  startChapter: number;
  /** undefined => from the start of startChapter (whole-chapter request). */
  startVerse?: number;
  endChapter: number;
  /** undefined => to the end of endChapter. */
  endVerse?: number;
}

export interface PassageVerse {
  chapter: number;
  verse: number;
  text: string;
}

export interface Passage {
  /** Normalized canonical reference, e.g. "John 8:31-32". */
  reference: string;
  translation: string;
  verses: PassageVerse[];
}

export interface PassageError {
  error: string;
}

/** Reads `/bible/web/<file>.json` and returns the Response (or 404). */
export type AssetFetch = (path: string) => Promise<Response>;

interface CompactBook {
  book: string;
  translation: string;
  chapters: Record<string, Record<string, string>>;
}

const REFERENCE_RE =
  /^(.*?)\s+(\d+)(?::(\d+))?(?:\s*[-–—]\s*(\d+)(?::(\d+))?)?\s*$/;

/**
 * Parse a human reference such as "John 8:31", "John 8:31-32", "Psalm 23",
 * "1 John 1:9", or "John 8:31-9:2". Returns null when it can't be parsed.
 */
export function parseReference(input: string): ParsedReference | null {
  if (!input) return null;
  const m = input.trim().match(REFERENCE_RE);
  if (!m) return null;

  const [, rawBook, c1, v1, n2, v2] = m;
  const book = lookupBook(rawBook);
  if (!book) return null;

  const startChapter = Number(c1);
  const startVerse = v1 != null ? Number(v1) : undefined;

  // No range on the right-hand side: single verse or whole chapter.
  if (n2 == null) {
    return { book, startChapter, startVerse, endChapter: startChapter, endVerse: startVerse };
  }

  // Right side had a colon -> it's "chapter:verse" (cross-chapter range).
  if (v2 != null) {
    return {
      book,
      startChapter,
      startVerse,
      endChapter: Number(n2),
      endVerse: Number(v2),
    };
  }

  // Right side is a bare number. If the left had a verse, it's a verse range in
  // the same chapter (8:31-32). Otherwise it's a chapter range (8-9).
  if (startVerse != null) {
    return { book, startChapter, startVerse, endChapter: startChapter, endVerse: Number(n2) };
  }
  return { book, startChapter, startVerse: undefined, endChapter: Number(n2), endVerse: undefined };
}

function lookupBook(raw: string): BookMeta | undefined {
  const norm = normalizeBookKey(raw);
  return BOOK_INDEX.get(norm) ?? BOOK_INDEX.get(norm.replace(/ /g, ""));
}

/** Build the canonical display string for a parsed reference. */
export function formatReference(ref: ParsedReference): string {
  const { book, startChapter, startVerse, endChapter, endVerse } = ref;
  if (startVerse == null) {
    return endChapter !== startChapter
      ? `${book.name} ${startChapter}-${endChapter}`
      : `${book.name} ${startChapter}`;
  }
  if (endChapter === startChapter) {
    return endVerse != null && endVerse !== startVerse
      ? `${book.name} ${startChapter}:${startVerse}-${endVerse}`
      : `${book.name} ${startChapter}:${startVerse}`;
  }
  return `${book.name} ${startChapter}:${startVerse}-${endChapter}:${endVerse ?? ""}`.replace(/:$/, "");
}

/**
 * Look up a passage by reference string, reading exact text from bundled JSON.
 * Never invents text; on any problem returns a `PassageError` the model can
 * read and correct.
 */
export async function getPassage(
  reference: string,
  assetFetch: AssetFetch,
  translationId = "web",
): Promise<Passage | PassageError> {
  const ref = parseReference(reference);
  if (!ref) {
    return { error: `Could not parse reference "${reference}". Use a form like "John 8:31-32".` };
  }

  const res = await assetFetch(`/bible/${translationId}/${ref.book.file}.json`);
  if (!res.ok) {
    return { error: `Could not load text for ${ref.book.name} (HTTP ${res.status}).` };
  }
  const data = (await res.json()) as CompactBook;

  const verses: PassageVerse[] = [];
  for (let c = ref.startChapter; c <= ref.endChapter; c++) {
    const chapter = data.chapters[String(c)];
    if (!chapter) continue;
    const verseNums = Object.keys(chapter)
      .map(Number)
      .sort((a, b) => a - b);

    const lo = c === ref.startChapter && ref.startVerse != null ? ref.startVerse : -Infinity;
    const hi = c === ref.endChapter && ref.endVerse != null ? ref.endVerse : Infinity;

    for (const v of verseNums) {
      if (v >= lo && v <= hi) verses.push({ chapter: c, verse: v, text: chapter[String(v)] });
      if (verses.length > MAX_VERSES) break;
    }
    if (verses.length > MAX_VERSES) break;
  }

  if (verses.length === 0) {
    return { error: `No verses found for "${formatReference(ref)}" in ${ref.book.name}.` };
  }
  if (verses.length > MAX_VERSES) {
    return {
      error: `That range is too large (over ${MAX_VERSES} verses). Request a smaller passage.`,
    };
  }

  return { reference: formatReference(ref), translation: data.translation, verses };
}

/** Render a passage as plain text for inclusion in a tool result. */
export function passageToText(passage: Passage): string {
  const body = passage.verses.map((v) => `${v.chapter}:${v.verse} ${v.text}`).join("\n");
  return `${passage.reference} (${passage.translation})\n${body}`;
}
