// Bible-quote markers: the model emits {{quote John 8:31-32 @web}} (block) or
// {{q John 8:31 @tisch}} (inline) instead of verse text; this module resolves
// the marker against the bundled /bible/ JSON and builds the display element.
// Verse text is always set via textContent — the model can never alter it.
import { BOOKS, TRANSLATIONS } from "./bible-data.gen.js";
import { detectLang, getStrings } from "../i18n.js";

const MARKER_RE =
  /\{\{(quote|q|ref)\s+([^{}@"“”]+?)(?:\s*@([a-z0-9]+))?(?:\s+(?:"([^"{}]+)"|“([^”{}]+)”))?\s*\}\}/g;

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

/**
 * The book's display name for a translation's language, e.g. "Mateo" for
 * `lang: "es"`. Falls back to the canonical English `name` when `lang` is
 * undefined or the book has no name recorded for it — which scholarly
 * (research) translations should always pass, so they stay in English.
 */
function bookNameFor(book, lang) {
  if (!lang) return book.name;
  return book.names?.[lang] ?? book.name;
}

/**
 * Canonical display string, with an en-dash for ranges: "John 8:31–32". Pass
 * `lang` to show the book name in that language (matching the translation
 * being quoted); omit it to keep the canonical English name.
 */
export function displayReference(ref, lang) {
  const { book, startChapter, startVerse, endChapter, endVerse } = ref;
  const name = bookNameFor(book, lang);
  if (startVerse == null) {
    return endChapter !== startChapter
      ? `${name} ${startChapter}–${endChapter}`
      : `${name} ${startChapter}`;
  }
  if (endChapter === startChapter) {
    return endVerse != null && endVerse !== startVerse
      ? `${name} ${startChapter}:${startVerse}–${endVerse}`
      : `${name} ${startChapter}:${startVerse}`;
  }
  const tail = endVerse != null ? `${endChapter}:${endVerse}` : `${endChapter}`;
  return `${name} ${startChapter}:${startVerse}–${tail}`;
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

/**
 * All complete markers in `text`:
 * { mode, refText, translationId, excerpt, start, end }.
 * Modes: "block" ({{quote …}}), "inline" ({{q …}}), "ref" ({{ref …}} — a bare
 * reference mention, no verse text shown). A quoted excerpt ("…" or “…”)
 * makes a quote/q marker a sub-verse phrase quote; it is ignored on ref.
 */
export function findMarkers(text) {
  const markers = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const keyword = m[1];
    const mode = keyword === "quote" ? "block" : keyword === "q" ? "inline" : "ref";
    markers.push({
      mode,
      refText: m[2].trim(),
      translationId: m[3] ?? null,
      excerpt: mode === "ref" ? null : (m[4] ?? m[5] ?? null),
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

/**
 * Collect the verses for a parsed reference from a CompactBook, each as a
 * `{ num, text }` pair so block quotes can show the verse number — the counter
 * familiar from a printed Bible.
 */
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
      if (v >= lo && v <= hi) verses.push({ num: v, text: chapter[String(v)] });
      if (verses.length > MAX_VERSES) return verses;
    }
  }
  return verses;
}

/** Plain joined text of collected verses (for inline quotes and excerpt matching). */
function versesText(verses) {
  return verses.map((v) => v.text).join(" ");
}

// --- "Read in context" portal links ---

/**
 * Build the external portal URL for a reference in a given translation, or
 * null when the translation has no configured portal.
 */
export function portalUrl(meta, ref) {
  if (!meta.link) return null;
  if (meta.link.portal === "biblegateway") {
    // BibleGateway takes the human reference nearly verbatim: "John 8:31-32".
    const search = displayReference(ref).replace(/–/g, "-");
    return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(search)}&version=${meta.link.version}`;
  }
  if (meta.link.portal === "step") {
    // STEP wants dotted references with space-free book names: "1John.1.9",
    // "John.8.31-32".
    let r = `${ref.book.name.replace(/ /g, "")}.${ref.startChapter}`;
    if (ref.startVerse != null) r += `.${ref.startVerse}`;
    if (ref.endChapter !== ref.startChapter) {
      r += `-${ref.endChapter}` + (ref.endVerse != null ? `.${ref.endVerse}` : "");
    } else if (ref.endVerse != null && ref.endVerse !== ref.startVerse) {
      r += `-${ref.endVerse}`;
    }
    return `https://www.stepbible.org/?q=version=${meta.link.version}%7Creference=${encodeURIComponent(r)}`;
  }
  return null;
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

/** The reference becomes a link to the portal when one is configured. */
function refElement(textContent, url) {
  const el = document.createElement(url ? "a" : "span");
  el.className = "quote-ref";
  el.textContent = textContent;
  if (url) {
    el.setAttribute("href", url);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  }
  return el;
}

// The standard copy icon (two overlapping sheets) used across the app, drawn
// inline so it needs no image request and inherits the button's text color.
const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
  "</svg>";

/**
 * Plain-text form of a passage for the clipboard: the verse text on its own
 * line (no on-screen superscript counters), then the reference and translation.
 */
function copyPlainText(verses, refLabel, meta) {
  return `${versesText(verses)}\n\n— ${refLabel} (${meta.name})`;
}

/**
 * Add a top-right copy button to a block quote. Clicking it writes the plain
 * passage text to the clipboard and flashes a "copied to clipboard" message for
 * three seconds. The message shows on click regardless of clipboard support so
 * the action always feels acknowledged; a blocked clipboard just fails quietly.
 */
function addCopyButton(el, verses, refLabel, meta) {
  const str = getStrings(detectLang());

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "quote-copy";
  btn.setAttribute("aria-label", str.verse_copy);
  btn.title = str.verse_copy;
  btn.innerHTML = COPY_ICON_SVG;

  const msg = document.createElement("span");
  msg.className = "quote-copied-msg";
  msg.setAttribute("role", "status");
  msg.textContent = str.verse_copied;
  msg.hidden = true;

  let hideTimer = null;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = navigator.clipboard;
    if (clip && clip.writeText) {
      clip.writeText(copyPlainText(verses, refLabel, meta)).catch(() => {});
    }
    msg.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      msg.hidden = true;
    }, 3000);
  });

  el.append(btn, msg);
}

function fillBlock(el, verses, refLabel, meta, url) {
  el.textContent = "";
  el.classList.remove("quote-pending");

  const ref = refElement(refLabel, url);

  const text = document.createElement("span");
  text.className = "quote-text";
  applyTextAttrs(text, meta);
  // Prefix each verse with its number — the superscript counter familiar from a
  // printed Bible. Numbers come from the bundled JSON, never the model; the
  // verse text itself is still set via textContent and can't be altered.
  verses.forEach((verse, i) => {
    if (i > 0) text.appendChild(document.createTextNode(" "));
    const num = document.createElement("sup");
    num.className = "quote-versenum";
    num.textContent = String(verse.num);
    text.append(num, document.createTextNode(verse.text));
  });

  const attrib = document.createElement("span");
  attrib.className = "quote-attrib";
  attrib.textContent = `— ${meta.name}`;

  el.append(ref, text, attrib);
  addCopyButton(el, verses, refLabel, meta);
}

function fillInline(el, verses, refLabel, meta, url) {
  el.textContent = "";
  el.classList.remove("quote-pending");

  const text = document.createElement("span");
  text.className = "quote-text";
  text.textContent = `“${versesText(verses)}”`;
  applyTextAttrs(text, meta);

  el.append(text, document.createTextNode(" ("));
  el.appendChild(refElement(`${refLabel}, ${meta.name}`, url));
  el.appendChild(document.createTextNode(")"));
}

// --- Sub-verse excerpt quotes ---

/**
 * Fold one source character for matching: typographic punctuation collapses to
 * its ASCII equivalent, everything else just case-folds. The bundled verses use
 * curly apostrophes/quotes and en/em dashes (e.g. WEB's “God’s Kingdom”) while
 * the model routinely emits the straight ASCII forms — folding them keeps a
 * word-perfect quote from being flagged as BAD QUOTATION over a glyph. Returns
 * a string because a few folds expand (… → "...") or case-folds lengthen.
 */
function foldChar(ch) {
  if ("’‘‛`´".includes(ch)) return "'"; // single quotes / apostrophes
  if ("“”„‟«»".includes(ch)) return '"'; // double quotes
  if (ch >= "‐" && ch <= "―") return "-"; // hyphen, dashes (– — etc.)
  if (ch === "…") return "..."; // ellipsis
  return ch.toLowerCase();
}

/**
 * Normalize for matching while remembering where each output character came
 * from: NFC, case-folded, punctuation folded, whitespace runs collapsed to a
 * single space, leading/trailing space trimmed. Returns `{ norm, map }` where
 * `map[k]` is the index in the NFC'd input of the character that produced
 * `norm[k]` — letting a fuzzy match be projected back onto the original text so
 * we can display the translation's own wording, not the model's.
 */
function normalizeWithMap(input) {
  const src = input.normalize("NFC");
  const out = [];
  const map = [];
  let pendingSpaceAt = -1; // index of a whitespace run awaiting a flush
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      if (pendingSpaceAt < 0) pendingSpaceAt = i;
      continue;
    }
    if (pendingSpaceAt >= 0) {
      if (out.length > 0) {
        // collapse the run to one space; drop it entirely if leading
        out.push(" ");
        map.push(pendingSpaceAt);
      }
      pendingSpaceAt = -1;
    }
    for (const fc of foldChar(ch)) {
      out.push(fc);
      map.push(i);
    }
  }
  // a trailing whitespace run is simply dropped (trim)
  return { norm: out.join(""), map };
}

function normalizeForMatch(s) {
  return normalizeWithMap(s).norm;
}

/** Edits tolerated for an excerpt of `len` normalized chars (~12%, min 1). */
function maxEdits(len) {
  return Math.max(1, Math.floor(len * 0.12));
}

/**
 * Approximate substring search: the minimum edit (Levenshtein) distance between
 * `needle` and any substring of `haystack`, with the best-matching span. The
 * first DP row is all zeros so a match may begin at any offset for free; the
 * minimum of the final row gives the best end and cost, and a parallel table of
 * start indices recovers the span. O(needle × haystack) — trivial at verse size.
 */
function approxSubstringMatch(needle, haystack) {
  const m = needle.length;
  const n = haystack.length;
  if (m === 0) return { start: 0, end: 0, cost: 0 };

  let prev = new Array(n + 1).fill(0); // row 0: empty needle, free start anywhere
  let prevStart = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1);
    const curStart = new Array(n + 1);
    cur[0] = i; // drop all needle chars so far; empty substring at offset 0
    curStart[0] = 0;
    for (let j = 1; j <= n; j++) {
      const sub = prev[j - 1] + (needle[i - 1] === haystack[j - 1] ? 0 : 1);
      const del = prev[j] + 1; // skip a needle char
      const ins = cur[j - 1] + 1; // consume a haystack char mid-span
      let best = sub;
      let from = prevStart[j - 1];
      if (del < best) {
        best = del;
        from = prevStart[j];
      }
      if (ins < best) {
        best = ins;
        from = curStart[j - 1];
      }
      cur[j] = best;
      curStart[j] = from;
    }
    prev = cur;
    prevStart = curStart;
  }

  let end = 0;
  let cost = prev[0];
  for (let j = 1; j <= n; j++) {
    if (prev[j] < cost) {
      cost = prev[j];
      end = j;
    }
  }
  return { start: prevStart[end], end, cost };
}

/**
 * Match the model's excerpt against the verse text, tolerating minor quoting
 * slips (a contraction expanded, a stray word) via an edit-distance threshold.
 * Returns `{ text }` carrying the translation's *own* wording for the matched
 * span — so the reader always sees authentic scripture, never the model's
 * paraphrase — or null when the excerpt is too far off (a real misquote).
 */
export function matchExcerpt(excerpt, verses) {
  const needle = normalizeForMatch(excerpt);
  if (needle.length === 0) return null;

  const originalJoined = versesText(verses).normalize("NFC");
  const { norm, map } = normalizeWithMap(originalJoined);
  const { start, end, cost } = approxSubstringMatch(needle, norm);
  if (cost > maxEdits(needle.length)) return null;

  let origStart = start < map.length ? map[start] : originalJoined.length;
  let origEnd = end < map.length ? map[end] : originalJoined.length;
  // Snap to whole words: a fuzzy edge can land mid-word (the model's typo was
  // shorter), and we want the translation's complete word, not a fragment.
  const isWord = (c) => c != null && /[\p{L}\p{N}'’]/u.test(c);
  while (origStart > 0 && isWord(originalJoined[origStart - 1])) origStart--;
  while (origEnd < originalJoined.length && isWord(originalJoined[origEnd])) origEnd++;
  return { text: originalJoined.slice(origStart, origEnd).trim() };
}

/**
 * A flagged misquote: the model's wording could not be found in the verse.
 * Tappable so the reader can compare what the model claimed against the
 * scripture — the desktop `title` tooltip is invisible on touch devices.
 */
function badQuotationSpan(refLabel, meta, excerpt, verses, url) {
  const span = errorSpan(`BAD QUOTATION (${refLabel}, ${meta.name})`);
  span.classList.add("quote-bad");
  span.setAttribute("title", `Not found in ${refLabel} (${meta.name}): “${excerpt}”`);
  span.setAttribute("role", "button");
  span.setAttribute("tabindex", "0");
  const toggle = (e) => {
    e.preventDefault();
    toggleBadPopup(span, excerpt, verses, refLabel, meta, url);
  };
  span.addEventListener("click", toggle);
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") toggle(e);
  });
  return span;
}

// One popup at a time; closed on outside click, Escape, or toggling again.
let openPopup = null;

function closePopup() {
  if (!openPopup) return;
  openPopup.popup.remove();
  document.removeEventListener("click", openPopup.onDocClick, true);
  document.removeEventListener("keydown", openPopup.onKeydown, true);
  openPopup = null;
}

/**
 * Open a popover holding `content`, anchored below `anchor` and clamped to the
 * viewport. Toggling the same anchor closes it; closes on outside click or
 * Escape. Returns false when this call closed an already-open popup for the
 * same anchor (so callers can treat a toggle as a no-op).
 */
function openPopupWith(anchor, content) {
  const wasOurs = openPopup && openPopup.anchor === anchor;
  closePopup();
  if (wasOurs) return false;

  const popup = document.createElement("div");
  popup.className = "quote-popup";
  popup.setAttribute("role", "dialog");
  popup.appendChild(content);
  document.body.appendChild(popup);

  // Anchor below the trigger, clamped to the viewport.
  const rect = anchor.getBoundingClientRect();
  popup.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - popup.offsetHeight - 12)}px`;
  popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;

  const onDocClick = (e) => {
    if (!popup.contains(e.target) && e.target !== anchor) closePopup();
  };
  const onKeydown = (e) => {
    if (e.key === "Escape") closePopup();
  };
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onKeydown, true);
  openPopup = { anchor, popup, onDocClick, onKeydown };
  return true;
}

/** Show the whole passage as a block quote in a popover near the excerpt. */
function togglePopup(anchor, verses, refLabel, meta, url) {
  const block = document.createElement("blockquote");
  block.className = "quote-block";
  fillBlock(block, verses, refLabel, meta, url);
  openPopupWith(anchor, block);
}

/**
 * Show a side-by-side comparison for a flagged misquote: the phrase the model
 * claimed to quote, and the passage's actual wording. Lets a reader on any
 * device see exactly what was wrong, not just that something was.
 */
function toggleBadPopup(anchor, excerpt, verses, refLabel, meta, url) {
  const content = document.createElement("div");
  content.className = "quote-compare";

  const quotedLabel = document.createElement("div");
  quotedLabel.className = "quote-compare-label";
  quotedLabel.textContent = "Quoted as";
  const quoted = document.createElement("p");
  quoted.className = "quote-compare-claimed";
  quoted.textContent = `“${excerpt}”`;

  const actualLabel = document.createElement("div");
  actualLabel.className = "quote-compare-label";
  actualLabel.textContent = "Actual text";
  const block = document.createElement("blockquote");
  block.className = "quote-block";
  fillBlock(block, verses, refLabel, meta, url);

  content.append(quotedLabel, quoted, actualLabel, block);
  openPopupWith(anchor, content);
}

/**
 * Fill an excerpt marker: a highlighted phrase (no reference or attribution
 * shown) that pops up the whole passage in block format on click. The caller
 * has already verified the excerpt occurs in the verse text.
 */
function fillExcerpt(el, verses, refLabel, meta, url, excerpt) {
  el.textContent = "";
  el.classList.remove("quote-pending");

  const text = document.createElement("span");
  text.className = "quote-text";
  text.textContent = excerpt;
  applyTextAttrs(text, meta);
  el.appendChild(text);

  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("title", `${refLabel} (${meta.name})`);
  const toggle = (e) => {
    e.preventDefault();
    togglePopup(el, verses, refLabel, meta, url);
  };
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") toggle(e);
  });
}

/**
 * Fill a bare reference mention ({{ref …}}): shows only the reference text,
 * and pops up the passage in block format on click. The book JSON is loaded
 * lazily on the first click — a mention that is never tapped costs nothing.
 */
function fillRefMark(el, ref, refLabel, meta, url, fetchImpl) {
  el.textContent = refLabel;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("title", meta.name);

  const toggle = async (e) => {
    e.preventDefault();
    if (openPopup && openPopup.anchor === el) {
      closePopup();
      return;
    }
    el.classList.add("quote-loading");
    let json;
    try {
      json = bookData.get(`${meta.id}/${ref.book.file}`) ?? (await loadBook(meta.id, ref.book, fetchImpl));
    } catch {
      el.replaceWith(errorSpan(`${refLabel} (${meta.name})`));
      return;
    } finally {
      el.classList.remove("quote-loading");
    }
    const verses = collectVerses(json, ref);
    if (verses.length === 0 || verses.length > MAX_VERSES) {
      el.replaceWith(errorSpan(`${refLabel} (${meta.name})`));
      return;
    }
    if (el.isConnected) togglePopup(el, verses, refLabel, meta, url);
  };
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") toggle(e);
  });
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

  const refLabel = displayReference(ref, meta.scholarly ? undefined : meta.lang);
  if (!translationCovers(meta, ref.book)) {
    return errorSpan(`${refLabel} (${meta.name})`);
  }

  if (marker.mode === "ref") {
    const el = document.createElement("span");
    el.className = "quote-refmark";
    fillRefMark(el, ref, refLabel, meta, portalUrl(meta, ref), fetchImpl);
    return el;
  }

  const excerpt = marker.excerpt ?? null;
  const isBlock = marker.mode === "block" && !excerpt;
  const el = document.createElement(isBlock ? "blockquote" : "span");
  el.className = isBlock ? "quote-block" : excerpt ? "quote-excerpt" : "quote-inline";

  const url = portalUrl(meta, ref);
  // Returns the element to display: `el` filled in, or an error replacement.
  // Replacement (not in-place mutation) is required because the synchronous
  // cache-hit path runs before `el` has a parent — replaceWith would no-op.
  const resolve = (json) => {
    const verses = collectVerses(json, ref);
    if (verses.length === 0 || verses.length > MAX_VERSES) {
      return errorSpan(`${refLabel} (${meta.name})`);
    }
    if (excerpt) {
      const match = matchExcerpt(excerpt, verses);
      if (!match) return badQuotationSpan(refLabel, meta, excerpt, verses, url);
      fillExcerpt(el, verses, refLabel, meta, url, match.text);
    } else if (isBlock) {
      fillBlock(el, verses, refLabel, meta, url);
    } else {
      fillInline(el, verses, refLabel, meta, url);
    }
    return el;
  };

  const key = `${meta.id}/${ref.book.file}`;
  if (bookData.has(key)) {
    return resolve(bookData.get(key));
  }
  if (failedBooks.has(key)) {
    return errorSpan(`${refLabel} (${meta.name})`);
  }

  el.classList.add("quote-pending");
  el.textContent = excerpt ?? refLabel;
  loadBook(meta.id, ref.book, fetchImpl)
    .then((json) => {
      if (!el.isConnected) return;
      const result = resolve(json);
      if (result !== el) el.replaceWith(result);
    })
    .catch(() => {
      if (el.isConnected) el.replaceWith(errorSpan(`${refLabel} (${meta.name})`));
    });
  return el;
}
