// Markdown rendering + a small DOM sanitizer. Pure enough to test in jsdom.
import { marked } from "./vendor/marked.esm.js";
import {
  buildQuoteElement,
  findMarkers,
  stripIncompleteTrailingMarker,
  translationForLang,
} from "./quotes.js";

marked.setOptions({ breaks: true, gfm: true });

const ALLOWED_TAGS = new Set([
  "P", "BR", "EM", "STRONG", "B", "I", "BLOCKQUOTE", "CODE", "PRE",
  "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "A", "HR", "SPAN",
]);

/**
 * Sanitize an HTML fragment: drop disallowed elements, strip event-handler
 * attributes and javascript: URLs. Returns safe innerHTML.
 */
export function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  walk(tpl.content);
  return tpl.innerHTML;
}

function walk(node) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const el = /** @type {Element} */ (child);
      if (!ALLOWED_TAGS.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes)); // unwrap unknown tags
        // Re-walk the unwrapped content in place.
        walk(node);
        return;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        const isLinkHref = el.tagName === "A" && name === "href";
        if (name.startsWith("on") || (isLinkHref && value.startsWith("javascript:"))) {
          el.removeAttribute(attr.name);
        } else if (!isLinkHref) {
          el.removeAttribute(attr.name); // keep only safe href; drop everything else
        }
      }
      if (el.tagName === "A") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
      walk(el);
    } else if (child.nodeType !== 3) {
      child.remove(); // comments, etc.
    }
  }
}

/** Render markdown text to sanitized HTML. */
export function renderMarkdown(md) {
  return sanitizeHtml(marked.parse(md ?? ""));
}

/** Set an element's content from markdown. */
export function renderMarkdownInto(el, md) {
  el.innerHTML = renderMarkdown(md);
}

// Bible-quote markers are swapped for private-use-area sentinels before the
// markdown pass (they survive marked and the sanitizer as plain text), then
// the sentinels are replaced with the real quote elements in the DOM.
const SENTINEL = "\uE000";
const SENTINEL_RE = /\uE000(\d+)\uE000/;

/**
 * Render a chat message: markdown plus {{quote …}}/{{q …}} bible-quote
 * markers. A marker still streaming in (unclosed "{{…" at the end) is hidden
 * until complete. `opts.lang` selects the default translation for markers
 * without an explicit @id.
 */
export function renderMessageInto(el, md, opts = {}) {
  const text = stripIncompleteTrailingMarker(md ?? "");
  const markers = findMarkers(text);

  let withSentinels = "";
  let pos = 0;
  markers.forEach((m, i) => {
    withSentinels += text.slice(pos, m.start) + SENTINEL + i + SENTINEL;
    pos = m.end;
  });
  withSentinels += text.slice(pos);

  el.innerHTML = renderMarkdown(withSentinels);
  if (markers.length === 0) return;

  const defaultTranslationId = translationForLang(opts.lang ?? "en").id;
  replaceSentinels(el, (i) => buildQuoteElement(markers[i], defaultTranslationId, opts.fetchImpl));
  hoistBlockQuotes(el);
}

/** Replace every sentinel in the element's text nodes with its quote element. */
function replaceSentinels(root, build) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (SENTINEL_RE.test(n.nodeValue)) textNodes.push(n);
  }
  for (const node of textNodes) {
    const frag = document.createDocumentFragment();
    let rest = node.nodeValue;
    let m;
    while ((m = rest.match(SENTINEL_RE))) {
      if (m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, m.index)));
      frag.appendChild(build(Number(m[1])));
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) frag.appendChild(document.createTextNode(rest));
    node.replaceWith(frag);
  }
}

/** A block quote that is a paragraph's only content replaces the paragraph. */
function hoistBlockQuotes(root) {
  for (const bq of root.querySelectorAll("blockquote.quote-block")) {
    const p = bq.parentElement;
    if (!p || p.tagName !== "P" || p.parentElement == null) continue;
    const others = Array.from(p.childNodes).filter((n) => n !== bq);
    const hasOtherContent = others.some((n) =>
      n.nodeType === 3 ? n.nodeValue.trim() !== "" : n.tagName !== "BR",
    );
    if (!hasOtherContent) p.replaceWith(bq);
  }
}
