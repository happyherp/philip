// Reference parsing + passage lookup against the bundled WEB JSON.
// Pure and dependency-injected: callers pass an `assetFetch` so this works
// identically in the Cloudflare Worker (env.ASSETS), in Node tests (a stub),
// and in a future WhatsApp webhook.

import { type BookMeta, bookNameFor, buildBookIndex, isOldTestament, normalizeBookKey } from "./books.ts";
import { TRANSLATIONS, translationById, translationCoversBook } from "./translations.ts";

const BOOK_INDEX = buildBookIndex();

/** Max verses a single lookup may return (longest chapter, Ps 119, is 176). */
export const MAX_VERSES = 200;

/** How many surrounding verses to include automatically for context. */
export const CONTEXT_BEFORE = 10;
export const CONTEXT_AFTER = 5;

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
  /** The exact verses the reference asked for. */
  verses: PassageVerse[];
  /** Up to {@link CONTEXT_BEFORE} verses immediately preceding `verses` (same book). */
  contextBefore: PassageVerse[];
  /** Up to {@link CONTEXT_AFTER} verses immediately following `verses` (same book). */
  contextAfter: PassageVerse[];
}

export interface PassageError {
  error: string;
}

/** A single passage request (reference + optional translation) in a batch. */
export interface PassageRequest {
  reference: string;
  translation?: string;
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

/**
 * Build the canonical display string for a parsed reference. `lang` selects
 * the book name's language (e.g. "es", "de") to match the translation being
 * quoted; omit it (or pass it for a scholarly translation) to keep the
 * canonical English name.
 */
export function formatReference(ref: ParsedReference, lang?: string): string {
  const { book, startChapter, startVerse, endChapter, endVerse } = ref;
  const name = bookNameFor(book, lang);
  if (startVerse == null) {
    return endChapter !== startChapter
      ? `${name} ${startChapter}-${endChapter}`
      : `${name} ${startChapter}`;
  }
  if (endChapter === startChapter) {
    return endVerse != null && endVerse !== startVerse
      ? `${name} ${startChapter}:${startVerse}-${endVerse}`
      : `${name} ${startChapter}:${startVerse}`;
  }
  return `${name} ${startChapter}:${startVerse}-${endChapter}:${endVerse ?? ""}`.replace(/:$/, "");
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

  const translation = translationById(translationId);
  if (!translation) {
    const ids = TRANSLATIONS.map((t) => t.id).join(", ");
    return { error: `Unknown translation "${translationId}". Available: ${ids}.` };
  }
  if (!translationCoversBook(translation, ref.book)) {
    const wanted = isOldTestament(ref.book)
      ? "Use wlc (Hebrew) or lxx (Greek Septuagint) for Old Testament books."
      : "Use tisch (Greek) for New Testament books.";
    const covers = translation.coverage === "nt" ? "New Testament" : "Old Testament";
    return {
      error: `${translation.name} does not contain ${ref.book.name} — it covers the ${covers} only. ${wanted}`,
    };
  }

  const res = await assetFetch(`/bible/${translationId}/${ref.book.file}.json`);
  if (!res.ok) {
    return { error: `Could not load text for ${ref.book.name} (HTTP ${res.status}).` };
  }
  const data = (await res.json()) as CompactBook;

  // Flatten the whole book into canonical verse order once, so the requested
  // range and the surrounding context can both be sliced from a single array.
  const allVerses: PassageVerse[] = [];
  const chapterNums = Object.keys(data.chapters)
    .map(Number)
    .sort((a, b) => a - b);
  for (const c of chapterNums) {
    const chapter = data.chapters[String(c)];
    const verseNums = Object.keys(chapter)
      .map(Number)
      .sort((a, b) => a - b);
    for (const v of verseNums) allVerses.push({ chapter: c, verse: v, text: chapter[String(v)] });
  }

  const inRange = (v: PassageVerse): boolean => {
    if (v.chapter < ref.startChapter || v.chapter > ref.endChapter) return false;
    if (v.chapter === ref.startChapter && ref.startVerse != null && v.verse < ref.startVerse) return false;
    if (v.chapter === ref.endChapter && ref.endVerse != null && v.verse > ref.endVerse) return false;
    return true;
  };

  const firstIdx = allVerses.findIndex(inRange);
  if (firstIdx === -1) {
    return { error: `No verses found for "${formatReference(ref)}" in ${ref.book.name}.` };
  }
  let lastIdx = firstIdx;
  for (let i = firstIdx; i < allVerses.length && inRange(allVerses[i]); i++) lastIdx = i;

  const verses = allVerses.slice(firstIdx, lastIdx + 1);
  if (verses.length > MAX_VERSES) {
    return {
      error: `That range is too large (over ${MAX_VERSES} verses). Request a smaller passage.`,
    };
  }

  const contextBefore = allVerses.slice(Math.max(0, firstIdx - CONTEXT_BEFORE), firstIdx);
  const contextAfter = allVerses.slice(lastIdx + 1, lastIdx + 1 + CONTEXT_AFTER);

  return {
    reference: formatReference(ref, translation.scholarly ? undefined : translation.lang),
    translation: data.translation,
    verses,
    contextBefore,
    contextAfter,
  };
}

/** Render a passage as plain text for inclusion in a tool result. */
export function passageToText(passage: Passage): string {
  const line = (v: PassageVerse) => `${v.chapter}:${v.verse} ${v.text}`;
  const span = (vs: PassageVerse[]) =>
    vs.length === 1
      ? `${vs[0].chapter}:${vs[0].verse}`
      : `${vs[0].chapter}:${vs[0].verse}-${vs[vs.length - 1].chapter}:${vs[vs.length - 1].verse}`;

  const sections: string[] = [`${passage.reference} (${passage.translation})`];
  const hasContext = passage.contextBefore.length > 0 || passage.contextAfter.length > 0;

  if (passage.contextBefore.length > 0) {
    sections.push(
      `Context before (${span(passage.contextBefore)}):\n${passage.contextBefore.map(line).join("\n")}`,
    );
  }
  // Label the requested verses only when context surrounds them, so the model
  // can tell exactly what it asked for from the extra material.
  const body = passage.verses.map(line).join("\n");
  sections.push(hasContext ? `Passage (${passage.reference}):\n${body}` : body);
  if (passage.contextAfter.length > 0) {
    sections.push(
      `Context after (${span(passage.contextAfter)}):\n${passage.contextAfter.map(line).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
