// Build-time only: download the World English Bible (public domain) from
// TehShrike/world-english-bible and reshape each book into a compact
// chapter -> verse -> text map committed under public/bible/web/.
//
// Run: npm run build:bible
// Network is required at build time only; the generated JSON is the runtime
// deliverable (no Bible API is called when the app serves a reader).

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BOOKS } from "../src/books.ts";

const SOURCE_BASE =
  "https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "bible", "web");

/** A raw object from a TehShrike book file. */
interface RawNode {
  type: string;
  chapterNumber?: number;
  verseNumber?: number;
  value?: string;
}

/** Our compact output shape, keyed by chapter then verse (both as strings). */
export interface CompactBook {
  book: string;
  translation: string;
  chapters: Record<string, Record<string, string>>;
}

/** Collapse runs of whitespace the source uses for typesetting. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Reshape a flat TehShrike array into chapter -> verse -> concatenated text. */
export function compact(name: string, nodes: RawNode[]): CompactBook {
  const chapters: Record<string, Record<string, string>> = {};
  for (const node of nodes) {
    if (typeof node.value !== "string") continue; // skip structural markers
    if (node.chapterNumber == null || node.verseNumber == null) continue;
    const c = String(node.chapterNumber);
    const v = String(node.verseNumber);
    const chapter = (chapters[c] ??= {});
    // A verse can span multiple text nodes (paragraph/poetry breaks) — append.
    chapter[v] = chapter[v] ? `${chapter[v]} ${tidy(node.value)}` : tidy(node.value);
  }
  // Final tidy in case the join introduced doubled spaces.
  for (const c of Object.keys(chapters)) {
    for (const v of Object.keys(chapters[c])) chapters[c][v] = tidy(chapters[c][v]);
  }
  return { book: name, translation: "WEB", chapters };
}

async function fetchBook(file: string): Promise<RawNode[]> {
  const res = await fetch(`${SOURCE_BASE}/${file}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${file}.json: HTTP ${res.status}`);
  return (await res.json()) as RawNode[];
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let totalVerses = 0;
  for (const book of BOOKS) {
    const nodes = await fetchBook(book.file);
    const compacted = compact(book.name, nodes);
    const verseCount = Object.values(compacted.chapters).reduce(
      (n, ch) => n + Object.keys(ch).length,
      0,
    );
    totalVerses += verseCount;
    await writeFile(
      join(OUT_DIR, `${book.file}.json`),
      JSON.stringify(compacted),
      "utf8",
    );
    console.log(`${book.name.padEnd(18)} ${verseCount} verses -> ${book.file}.json`);
  }
  console.log(`\nDone. ${BOOKS.length} books, ${totalVerses} verses written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
