// Build-time only: download the original-language / scholarly texts from the
// getBible v2 corpus and reshape into the same compact chapter -> verse -> text
// format used for the WEB:
//
//   tisch  NT Tischendorf 8th Edition (Greek NT)        Public Domain
//   wlc    Westminster Leningrad Codex (Hebrew OT)      Public Domain
//   lxx    Septuagint, accented (Greek OT)              Free non-commercial distribution
//   vul    Clementine Vulgate (Latin)                   Public Domain
//
// Run: npm run build:bible:originals
// Network is required at build time only; the generated JSON is the runtime
// deliverable.
//
// getBible book names are localized (Hebrew/Greek/Latin), but every book
// carries `nr` — the standard 66-book canon number (Genesis 1 … Revelation 66,
// deuterocanon 67+). We map strictly by nr and skip anything outside 1-66,
// which drops the LXX/Vulgate deuterocanon and tolerates partial canons.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { BOOKS, type BookMeta } from "../src/books.ts";
import type { CompactBook } from "./build-bible.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_BIBLE = join(__dirname, "..", "public", "bible");

const GETBIBLE_BASE = "https://api.getbible.net/v2";

// getBible v2 format: { translation, books: [{ nr, name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
interface GetBibleVerse {
  verse: number;
  text: string;
}

interface GetBibleChapter {
  chapter: number;
  verses: GetBibleVerse[];
}

interface GetBibleBook {
  nr: number | null;
  name: string;
  chapters: GetBibleChapter[];
}

export interface GetBibleSource {
  translation: string;
  books: GetBibleBook[];
}

/** Collapse whitespace and strip stray source markup (tags, footnote marks). */
function tidy(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/#/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert a getBible source into CompactBooks keyed strictly by canon number
 * (`nr` 1-66 -> BOOKS[nr-1]). Books outside 1-66 and empty verses are skipped.
 */
export function convertGetBible(
  source: GetBibleSource,
  translationName: string,
): Array<{ meta: BookMeta; compact: CompactBook }> {
  const result: Array<{ meta: BookMeta; compact: CompactBook }> = [];

  for (const srcBook of source.books) {
    const nr = srcBook.nr;
    if (typeof nr !== "number" || nr < 1 || nr > BOOKS.length) continue;
    const meta = BOOKS[nr - 1];
    const chapters: Record<string, Record<string, string>> = {};

    for (const srcChapter of srcBook.chapters) {
      const c = String(srcChapter.chapter);
      for (const srcVerse of srcChapter.verses) {
        const text = tidy(srcVerse.text);
        if (!text) continue;
        (chapters[c] ??= {})[String(srcVerse.verse)] = text;
      }
    }

    if (Object.keys(chapters).length === 0) continue;
    result.push({ meta, compact: { book: meta.name, translation: translationName, chapters } });
  }

  return result;
}

async function fetchBible(code: string): Promise<GetBibleSource> {
  const url = `${GETBIBLE_BASE}/${code}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return (await res.json()) as GetBibleSource;
}

async function buildTranslation(params: {
  code: string;
  translationName: string;
  translationId: string;
  expectedBooks: number;
}) {
  const { code, translationName, translationId, expectedBooks } = params;
  const outDir = join(PUBLIC_BIBLE, translationId);
  await mkdir(outDir, { recursive: true });

  console.log(`\nDownloading ${translationName} (getBible "${code}")…`);
  const source = await fetchBible(code);
  const books = convertGetBible(source, translationName);

  if (books.length !== expectedBooks) {
    throw new Error(
      `${translationName}: expected ${expectedBooks} books, got ${books.length} — source numbering changed?`,
    );
  }

  let totalVerses = 0;
  for (const { meta, compact } of books) {
    const verseCount = Object.values(compact.chapters).reduce(
      (n, ch) => n + Object.keys(ch).length,
      0,
    );
    totalVerses += verseCount;
    await writeFile(join(outDir, `${meta.file}.json`), JSON.stringify(compact), "utf8");
    console.log(`  ${compact.book.padEnd(18)} ${verseCount} verses -> ${meta.file}.json`);
  }
  console.log(`Done. ${books.length} books, ${totalVerses} verses -> ${outDir}`);
}

async function main() {
  await buildTranslation({
    code: "tischendorf",
    translationName: "Tischendorf",
    translationId: "tisch",
    expectedBooks: 27,
  });

  await buildTranslation({
    code: "codex",
    translationName: "WLC",
    translationId: "wlc",
    expectedBooks: 39,
  });

  await buildTranslation({
    code: "lxx",
    translationName: "LXX",
    translationId: "lxx",
    expectedBooks: 39,
  });

  await buildTranslation({
    code: "vulgate",
    translationName: "Vulgata",
    translationId: "vul",
    expectedBooks: 66,
  });
}

// Only run when executed directly (the converter is imported by unit tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
