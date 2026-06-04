// Markdown rendering + a small DOM sanitizer. Pure enough to test in jsdom.
import { marked } from "./vendor/marked.esm.js";

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
