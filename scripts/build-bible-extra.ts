// Build-time only: download Spanish (Reina-Valera 1909) and German (Luther 1545)
// Bibles from scrollmapper/bible_databases and reshape into the same compact
// chapter -> verse -> text format used for the WEB.
//
// Run: npm run build:bible:extra
// Network is required at build time only; the generated JSON is the runtime
// deliverable.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BOOKS } from "../src/books.ts";
import type { CompactBook } from "./build-bible.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_BIBLE = join(__dirname, "..", "public", "bible");

// scrollmapper/bible_databases JSON format:
// { "translation": "...", "books": [{ "name": "...", "chapters": [{ "chapter": N, "verses": [{ "verse": N, "text": "..." }] }] }] }
const SCROLLMAPPER_BASE =
  "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json";

interface SourceVerse {
  verse: number;
  text: string;
}

interface SourceChapter {
  chapter: number;
  verses: SourceVerse[];
}

interface SourceBook {
  name: string;
  chapters: SourceChapter[];
}

interface SourceBible {
  translation: string;
  books: SourceBook[];
}

/** Collapse runs of whitespace. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fetchBible(filename: string): Promise<SourceBible> {
  const url = `${SCROLLMAPPER_BASE}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return (await res.json()) as SourceBible;
}

/**
 * Convert a scrollmapper nested-JSON bible into our CompactBook format.
 * Books are matched by position (index 0 = Genesis, index 65 = Revelation)
 * since both the source and our BOOKS array follow the Protestant 66-book canon.
 */
function convertBible(
  source: SourceBible,
  translationName: string,
): CompactBook[] {
  const result: CompactBook[] = [];

  for (let i = 0; i < Math.min(source.books.length, BOOKS.length); i++) {
    const srcBook = source.books[i];
    const bookMeta = BOOKS[i];
    const chapters: Record<string, Record<string, string>> = {};

    for (const srcChapter of srcBook.chapters) {
      const c = String(srcChapter.chapter);
      chapters[c] = {};
      for (const srcVerse of srcChapter.verses) {
        chapters[c][String(srcVerse.verse)] = tidy(srcVerse.text);
      }
    }

    result.push({ book: bookMeta.name, translation: translationName, chapters });
  }

  return result;
}

async function buildTranslation(params: {
  filename: string;
  translationName: string;
  translationId: string;
}) {
  const { filename, translationName, translationId } = params;
  const outDir = join(PUBLIC_BIBLE, translationId);
  await mkdir(outDir, { recursive: true });

  console.log(`\nDownloading ${translationName} (${filename})…`);
  const source = await fetchBible(filename);
  const books = convertBible(source, translationName);

  let totalVerses = 0;
  for (let i = 0; i < books.length; i++) {
    const compact = books[i];
    const bookMeta = BOOKS[i];
    const verseCount = Object.values(compact.chapters).reduce(
      (n, ch) => n + Object.keys(ch).length,
      0,
    );
    totalVerses += verseCount;
    await writeFile(join(outDir, `${bookMeta.file}.json`), JSON.stringify(compact), "utf8");
    console.log(`  ${compact.book.padEnd(18)} ${verseCount} verses -> ${bookMeta.file}.json`);
  }
  console.log(`Done. ${books.length} books, ${totalVerses} verses -> ${outDir}`);
}

async function main() {
  await buildTranslation({
    filename: "SpaRV.json",
    translationName: "RV1909",
    translationId: "rv1909",
  });

  await buildTranslation({
    filename: "GerBoLut.json",
    translationName: "Luther 1545",
    translationId: "luther1545",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
