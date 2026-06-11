// Bible-quote markers: the model emits {{quote John 8:31-32 @web}} (block) or
// {{q John 8:31 @tisch}} (inline) instead of verse text; this module resolves
// the marker against the bundled /bible/ JSON and builds the display element.
// Verse text is always set via textContent — the model can never alter it.
import { BOOKS, TRANSLATIONS } from "./bible-data.gen.js";

const MARKER_RE = /\{\{(quote|q)\s+([^{}@]+?)(?:\s*@([a-z0-9]+))?\s*\}\}/g;

/** Max verses a single marker may render (mirrors src/bible.ts). */
const MAX_VERSES = 200;

// --- Reference parsing (JS port of src/bible.ts / src/books.ts) ---

function normalizeBookKey(raw) {
  return raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

const BOOK_INDEX = (() => {
  const index = new Map();
  const add = (key, book) => {
    const norm = normalizeBookKey(key);
    index.set(norm, book);
    index.set(norm.replace(/ /g, ""), book);
  };
  for (const book of BOOKS) {
    add(book.name, book);
    add(book.file, book);
    for (const alias of book.aliases) add(alias, book);
  }
  return index;
})();

const REFERENCE_RE = /^(.*?)\s+(\d+)(?::(\d+))?(?:\s*[-–—]\s*(\d+)(?::(\d+))?)?\s*$/;

/** Parse "John 8:31-32" etc. Returns null when it can't be parsed. */
export function parseReference(input) {
  if (!input) return null;
  const m = input.trim().match(REFERENCE_RE);
  if (!m) return null;

  const [, rawBook, c1, v1, n2, v2] = m;
  const norm = normalizeBookKey(rawBook);
  const book = BOOK_INDEX.get(norm) ?? BOOK_INDEX.get(norm.replace(/ /g, ""));
  if (!book) return null;

  const startChapter = Number(c1);
  const startVerse = v1 != null ? Number(v1) : undefined;

  if (n2 == null) {
    return { book, startChapter, startVerse, endChapter: startChapter, endVerse: startVerse };
  }
  if (v2 != null) {
    return { book, startChapter, startVerse, endChapter: Number(n2), endVerse: Number(v2) };
  }
  if (startVerse != null) {
    return { book, startChapter, startVerse, endChapter: startChapter, endVerse: Number(n2) };
  }
  return { book, startChapter, startVerse: undefined, endChapter: Number(n2), endVerse: undefined };
}

/** Canonical display string, with an en-dash for ranges: "John 8:31–32". */
export function displayReference(ref) {
  const { book, startChapter, startVerse, endChapter, endVerse } = ref;
  if (startVerse == null) {
    return endChapter !== startChapter
      ? `${book.name} ${startChapter}–${endChapter}`
      : `${book.name} ${startChapter}`;
  }
  if (endChapter === startChapter) {
    return endVerse != null && endVerse !== startVerse
      ? `${book.name} ${startChapter}:${startVerse}–${endVerse}`
      : `${book.name} ${startChapter}:${startVerse}`;
  }
  const tail = endVerse != null ? `${endChapter}:${endVerse}` : `${endChapter}`;
  return `${book.name} ${startChapter}:${startVerse}–${tail}`;
}

// --- Translations ---

const TRANSLATION_BY_ID = new Map(TRANSLATIONS.map((t) => [t.id, t]));
const READER_BY_LANG = new Map(
  TRANSLATIONS.filter((t) => !t.scholarly).map((t) => [t.lang, t]),
);

export function translationForLang(lang) {
  return (
    READER_BY_LANG.get(lang) ??
    READER_BY_LANG.get(String(lang ?? "").split("-")[0]) ??
    TRANSLATIONS[0]
  );
}

function translationCovers(meta, book) {
  if (meta.coverage === "full") return true;
  const isOT = BOOKS.indexOf(book) < 39;
  return meta.coverage === "ot" ? isOT : !isOT;
}

// --- Marker detection ---

/** All complete markers in `text`: { mode, refText, translationId, start, end }. */
export function findMarkers(text) {
  const markers = [];
  for (const m of text.matchAll(MARKER_RE)) {
    markers.push({
      mode: m[1] === "quote" ? "block" : "inline",
      refText: m[2].trim(),
      translationId: m[3] ?? null,
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return markers;
}

/**
 * Drop a partially streamed marker from the end of the text so the raw
 * "{{quote Joh" never flashes while tokens arrive.
 */
export function stripIncompleteTrailingMarker(text) {
  return text.replace(/\{\{?[^{}]*$/, "");
}

// --- Verse loading (cached against the bundled /bible/ JSON) ---

const bookData = new Map(); // "translation/file" -> CompactBook json (resolved)
const bookPromises = new Map(); // "translation/file" -> in-flight fetch promise
const failedBooks = new Set(); // keys that already 404'd — don't refetch per token

function loadBook(translationId, book, fetchImpl) {
  const key = `${translationId}/${book.file}`;
  if (bookPromises.has(key)) return bookPromises.get(key);
  const promise = (async () => {
    const res = await (fetchImpl ?? fetch)(`/bible/${key}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    bookData.set(key, json);
    return json;
  })().catch((err) => {
    failedBooks.add(key);
    throw err;
  });
  bookPromises.set(key, promise);
  return promise;
}

/** Test hook: clear the module-level book cache. */
export function clearQuoteCache() {
  bookData.clear();
  bookPromises.clear();
  failedBooks.clear();
}

/** Collect the verse texts for a parsed reference from a CompactBook. */
function collectVerses(json, ref) {
  const verses = [];
  for (let c = ref.startChapter; c <= ref.endChapter; c++) {
    const chapter = json.chapters[String(c)];
    if (!chapter) continue;
    const nums = Object.keys(chapter)
      .map(Number)
      .sort((a, b) => a - b);
    const lo = c === ref.startChapter && ref.startVerse != null ? ref.startVerse : -Infinity;
    const hi = c === ref.endChapter && ref.endVerse != null ? ref.endVerse : Infinity;
    for (const v of nums) {
      if (v >= lo && v <= hi) verses.push(chapter[String(v)]);
      if (verses.length > MAX_VERSES) return verses;
    }
  }
  return verses;
}

// --- Element building ---

function errorSpan(text) {
  const span = document.createElement("span");
  span.className = "quote-error";
  span.textContent = text;
  return span;
}

function applyTextAttrs(el, meta) {
  el.setAttribute("lang", meta.lang);
  el.setAttribute("data-translation", meta.id);
  if (meta.dir) el.setAttribute("dir", meta.dir);
}

function fillBlock(el, verses, refLabel, meta) {
  el.textContent = "";
  el.classList.remove("quote-pending");

  const ref = document.createElement("span");
  ref.className = "quote-ref";
  ref.textContent = refLabel;

  const text = document.createElement("span");
  text.className = "quote-text";
  text.textContent = verses.join(" ");
  applyTextAttrs(text, meta);

  const attrib = document.createElement("span");
  attrib.className = "quote-attrib";
  attrib.textContent = `— ${meta.name}`;

  el.append(ref, text, attrib);
}

function fillInline(el, verses, refLabel, meta) {
  el.textContent = "";
  el.classList.remove("quote-pending");

  const text = document.createElement("span");
  text.className = "quote-text";
  text.textContent = `“${verses.join(" ")}”`;
  applyTextAttrs(text, meta);

  const ref = document.createElement("span");
  ref.className = "quote-ref";
  ref.textContent = ` (${refLabel}, ${meta.name})`;

  el.append(text, ref);
}

/**
 * Build the DOM element for a marker. Resolves synchronously when the book
 * JSON is already cached; otherwise shows a placeholder and fills in when the
 * fetch lands (skipped if the element was re-rendered away in the meantime).
 *
 * Never renders the raw {{…}} text; on any problem it degrades to a muted
 * span carrying the plain reference.
 */
export function buildQuoteElement(marker, defaultTranslationId, fetchImpl) {
  const ref = parseReference(marker.refText);
  if (!ref) return errorSpan(marker.refText);

  const meta =
    (marker.translationId && TRANSLATION_BY_ID.get(marker.translationId)) ||
    TRANSLATION_BY_ID.get(defaultTranslationId) ||
    TRANSLATIONS[0];

  const refLabel = displayReference(ref);
  if (!translationCovers(meta, ref.book)) {
    return errorSpan(`${refLabel} (${meta.name})`);
  }

  const el = document.createElement(marker.mode === "block" ? "blockquote" : "span");
  el.className = marker.mode === "block" ? "quote-block" : "quote-inline";
  const fill = marker.mode === "block" ? fillBlock : fillInline;

  const finish = (json) => {
    const verses = collectVerses(json, ref);
    if (verses.length === 0 || verses.length > MAX_VERSES) {
      el.replaceWith(errorSpan(`${refLabel} (${meta.name})`));
      return;
    }
    fill(el, verses, refLabel, meta);
  };

  const key = `${meta.id}/${ref.book.file}`;
  if (bookData.has(key)) {
    finish(bookData.get(key));
    return el;
  }
  if (failedBooks.has(key)) {
    return errorSpan(`${refLabel} (${meta.name})`);
  }

  el.classList.add("quote-pending");
  el.textContent = refLabel;
  loadBook(meta.id, ref.book, fetchImpl)
    .then((json) => {
      if (el.isConnected) finish(json);
    })
    .catch(() => {
      if (el.isConnected) el.replaceWith(errorSpan(`${refLabel} (${meta.name})`));
    });
  return el;
}
