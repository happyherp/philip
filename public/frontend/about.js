// The "About" overlay: what Philip is for, what it does, and the texts and
// languages it works with. Opened from the "about" chip in the header.
//
// Content is built here from the i18n `about` block plus the generated
// translation list, so the panel stays in step with both the UI language and
// the actual bundled Bibles (source of truth: src/translations.ts).
import { TRANSLATIONS } from "./bible-data.gen.js";

const GITHUB_URL = "https://github.com/happyherp/philip";

// The UI languages Philip speaks, by endonym. Kept language-independent — a
// language's own name reads the same whatever UI language is active.
const UI_LANGS = ["English", "Español", "Deutsch"];

let overlayEl = null;
let contentEl = null;
let lastStrings = null;
let lastLang = "en";

// The configured LLM id, fetched once from /api/model (lazily, on first open).
// null until fetched; "" if the fetch failed (so we show a graceful fallback).
let modelName = null;
let modelPromise = null;

function fetchModel() {
  if (modelPromise) return modelPromise;
  modelPromise = fetch("/api/model")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      modelName = typeof data?.model === "string" ? data.model : "";
    })
    .catch(() => {
      modelName = "";
    });
  return modelPromise;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Build a labelled list of translations (name — full name, with coverage). */
function renderTranslationGroup(list, coverageLabels) {
  const ul = el("ul", "about-translations");
  for (const tr of list) {
    const li = el("li");
    li.appendChild(el("span", "about-translation-name", tr.name));
    li.appendChild(el("span", "about-translation-full", tr.fullName));
    const cov = coverageLabels?.[tr.coverage];
    if (cov) li.appendChild(el("span", "about-badge", cov));
    ul.appendChild(li);
  }
  return ul;
}

/** Rebuild the panel body from the current strings. */
function render(a) {
  contentEl.innerHTML = "";

  const header = el("div", "about-header");
  const h = el("h2", "about-title", a.title);
  h.id = "about-title";
  header.appendChild(h);
  const close = el("button", "about-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", a.close);
  close.addEventListener("click", () => setOpen(false));
  header.appendChild(close);
  contentEl.appendChild(header);

  for (const para of a.intro) {
    contentEl.appendChild(el("p", "about-intro", para));
  }

  // Features
  contentEl.appendChild(el("h3", "about-section-title", a.features_title));
  const feats = el("ul", "about-features");
  for (const f of a.features) feats.appendChild(el("li", null, f));
  contentEl.appendChild(feats);

  // Languages Philip speaks
  contentEl.appendChild(el("h3", "about-section-title", a.languages_title));
  const langs = el("ul", "about-langs");
  for (const name of UI_LANGS) langs.appendChild(el("li", null, name));
  contentEl.appendChild(langs);

  // Bible translations, split into reading vs original-language/study texts.
  contentEl.appendChild(el("h3", "about-section-title", a.translations_title));
  contentEl.appendChild(el("p", "about-note", a.translations_note));
  const readers = TRANSLATIONS.filter((t) => !t.scholarly);
  const scholarly = TRANSLATIONS.filter((t) => t.scholarly);
  if (readers.length) {
    contentEl.appendChild(el("h4", "about-subhead", a.reader_label));
    contentEl.appendChild(renderTranslationGroup(readers, a.coverage));
  }
  if (scholarly.length) {
    contentEl.appendChild(el("h4", "about-subhead", a.scholarly_label));
    contentEl.appendChild(renderTranslationGroup(scholarly, a.coverage));
  }

  // The underlying LLM, named from the server's configured model id.
  contentEl.appendChild(el("h3", "about-section-title", a.model_title));
  const modelLine = el("p", "about-model");
  if (modelName == null) {
    modelLine.textContent = a.model_loading;
    // Kick off the fetch; re-render once it resolves if the panel is still open.
    fetchModel().then(() => {
      if (overlayEl && !overlayEl.hidden && lastStrings) render(lastStrings);
    });
  } else if (modelName) {
    modelLine.appendChild(document.createTextNode(`${a.model_prefix} `));
    modelLine.appendChild(el("span", "about-model-id", modelName));
  } else {
    modelLine.textContent = a.model_unknown;
  }
  contentEl.appendChild(modelLine);

  // Open source / GitHub
  contentEl.appendChild(el("h3", "about-section-title", a.github_title));
  const gh = el("a", "about-github", a.github_label);
  gh.href = GITHUB_URL;
  gh.target = "_blank";
  gh.rel = "noopener noreferrer";
  contentEl.appendChild(gh);
}

function setOpen(open) {
  if (!overlayEl) return;
  if (open && lastStrings) render(lastStrings);
  overlayEl.hidden = !open;
  if (aboutLink) aboutLink.setAttribute("aria-expanded", String(open));
}

let aboutLink = null;

/**
 * Wire the about chip and overlay. Call once at boot. Re-apply strings on a
 * language switch via applyAboutI18n().
 */
export function setupAbout() {
  aboutLink = document.getElementById("about-link");
  overlayEl = document.getElementById("about");
  if (!aboutLink || !overlayEl) return;
  contentEl = overlayEl.querySelector(".about-content");

  aboutLink.addEventListener("click", (e) => {
    e.preventDefault();
    setOpen(true);
  });

  // Dismiss on the backdrop, Escape, or the close button (wired in render()).
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlayEl.hidden) setOpen(false);
  });
}

/** Apply the current UI strings/language to the about chip and panel. */
export function applyAboutI18n(strings, lang) {
  lastStrings = strings.about;
  lastLang = lang;
  if (aboutLink && strings.about) {
    aboutLink.textContent = strings.about.link;
    aboutLink.title = strings.about.title;
  }
  // Rebuild the panel if it's currently open so the language change shows.
  if (overlayEl && !overlayEl.hidden && lastStrings) render(lastStrings);
}
