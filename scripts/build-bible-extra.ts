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

// Scrollmapper bible_databases JSON exports.
// Format: { "resultset": { "row": [{ "field": [bookNum, chapter, verse, text] }] } }
const SCROLLMAPPER_BASE =
  "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/json";

interface ScrollmapperRow {
  field: [number | string, number | string, number | string, string];
}

interface ScrollmapperFile {
  resultset: {
    row: ScrollmapperRow[];
  };
}

/** Collapse runs of whitespace. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fetchScrollmapper(filename: string): Promise<ScrollmapperFile> {
  const url = `${SCROLLMAPPER_BASE}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return (await res.json()) as ScrollmapperFile;
}

/**
 * Convert a scrollmapper flat-row file into 66 CompactBook objects keyed by
 * BOOKS index. Book numbers in the source are 1-based (1 = Genesis).
 */
function splitByBook(
  data: ScrollmapperFile,
  translationName: string,
): Map<number, CompactBook> {
  const byBook = new Map<number, CompactBook>();

  for (const row of data.resultset.row) {
    const [rawBook, rawChapter, rawVerse, rawText] = row.field;
    const bookNum = Number(rawBook);
    if (bookNum < 1 || bookNum > 66) continue; // skip deuterocanonical or header rows
    const bookMeta = BOOKS[bookNum - 1];
    if (!bookMeta) continue;

    const c = String(Number(rawChapter));
    const v = String(Number(rawVerse));
    const text = tidy(rawText);

    if (!byBook.has(bookNum)) {
      byBook.set(bookNum, { book: bookMeta.name, translation: translationName, chapters: {} });
    }
    const compact = byBook.get(bookNum)!;
    const chapter = (compact.chapters[c] ??= {});
    chapter[v] = chapter[v] ? `${chapter[v]} ${text}` : text;
  }

  // Final tidy pass.
  for (const compact of [...byBook.values()]) {
    for (const c of Object.keys(compact.chapters)) {
      for (const v of Object.keys(compact.chapters[c])) {
        compact.chapters[c][v] = tidy(compact.chapters[c][v]);
      }
    }
  }

  return byBook;
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
  const data = await fetchScrollmapper(filename);
  const byBook = splitByBook(data, translationName);

  let totalVerses = 0;
  for (let i = 0; i < BOOKS.length; i++) {
    const book = BOOKS[i];
    const compact = byBook.get(i + 1);
    if (!compact) {
      console.warn(`  WARNING: No data found for book ${i + 1} (${book.name})`);
      continue;
    }
    const verseCount = Object.values(compact.chapters).reduce(
      (n, ch) => n + Object.keys(ch).length,
      0,
    );
    totalVerses += verseCount;
    await writeFile(join(outDir, `${book.file}.json`), JSON.stringify(compact), "utf8");
    console.log(`  ${book.name.padEnd(18)} ${verseCount} verses -> ${book.file}.json`);
  }
  console.log(`Done. ${BOOKS.length} books, ${totalVerses} verses -> ${outDir}`);
}

async function main() {
  await buildTranslation({
    filename: "t_rvr09.json",
    translationName: "RV1909",
    translationId: "rv1909",
  });

  await buildTranslation({
    filename: "t_luth1545.json",
    translationName: "Luther 1545",
    translationId: "luther1545",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
