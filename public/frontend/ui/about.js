// The "About" overlay: what Philip is for, what it does, the languages it
// speaks, the bundled Bible translations, the underlying model, and a link to
// the project. Opened from the "about" chip; closes on the close button, a
// backdrop click, or Escape.
//
// Content comes from the i18n `about` block plus the generated translation list,
// so it stays in step with both the UI language and the actual bundled Bibles.
import { html, useState, useEffect } from "../vendor/preact.standalone.js";
import { TRANSLATIONS } from "../bible-data.gen.js";

const GITHUB_URL = "https://github.com/happyherp/philip";

// The UI languages Philip speaks, by endonym. Language-independent — a
// language's own name reads the same whatever UI language is active.
const UI_LANGS = ["English", "Español", "Deutsch"];

// The configured LLM id, fetched once from /api/model and cached across opens.
// null until fetched; "" if the fetch failed (so we show a graceful fallback).
let cachedModel = null;
let modelPromise = null;
function fetchModel() {
  if (modelPromise) return modelPromise;
  modelPromise = fetch("/api/model")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      cachedModel = typeof data?.model === "string" ? data.model : "";
      return cachedModel;
    })
    .catch(() => {
      cachedModel = "";
      return cachedModel;
    });
  return modelPromise;
}

function TranslationGroup({ list, coverage }) {
  return html`
    <ul class="about-translations">
      ${list.map(
        (tr) => html`
          <li key=${tr.id}>
            <span class="about-translation-name">${tr.name}</span>
            <span class="about-translation-full">${tr.fullName}</span>
            ${coverage?.[tr.coverage] &&
            html`<span class="about-badge">${coverage[tr.coverage]}</span>`}
          </li>
        `,
      )}
    </ul>
  `;
}

function ModelLine({ a }) {
  const [model, setModel] = useState(cachedModel);
  useEffect(() => {
    if (model == null) fetchModel().then(setModel);
  }, []);
  if (model == null) return html`<p class="about-model">${a.model_loading}</p>`;
  if (model)
    return html`<p class="about-model">${a.model_prefix} <span class="about-model-id">${model}</span></p>`;
  return html`<p class="about-model">${a.model_unknown}</p>`;
}

export function AboutOverlay({ open, t, onClose }) {
  const a = t.about;

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const readers = TRANSLATIONS.filter((x) => !x.scholarly);
  const scholarly = TRANSLATIONS.filter((x) => x.scholarly);

  return html`
    <div
      id="about"
      class="about-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      hidden=${!open}
      onClick=${(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div class="about-panel">
        <div class="about-content">
          ${open &&
          html`
            <div class="about-header">
              <h2 id="about-title" class="about-title">${a.title}</h2>
              <button type="button" class="about-close" aria-label=${a.close} onClick=${onClose}>
                ×
              </button>
            </div>
            ${a.intro.map((p, i) => html`<p key=${i} class="about-intro">${p}</p>`)}

            <h3 class="about-section-title">${a.features_title}</h3>
            <ul class="about-features">
              ${a.features.map((f, i) => html`<li key=${i}>${f}</li>`)}
            </ul>

            <h3 class="about-section-title">${a.languages_title}</h3>
            <ul class="about-langs">
              ${UI_LANGS.map((name) => html`<li key=${name}>${name}</li>`)}
            </ul>

            <h3 class="about-section-title">${a.translations_title}</h3>
            <p class="about-note">${a.translations_note}</p>
            ${readers.length
              ? html`<h4 class="about-subhead">${a.reader_label}</h4>
                  <${TranslationGroup} list=${readers} coverage=${a.coverage} />`
              : null}
            ${scholarly.length
              ? html`<h4 class="about-subhead">${a.scholarly_label}</h4>
                  <${TranslationGroup} list=${scholarly} coverage=${a.coverage} />`
              : null}

            <h3 class="about-section-title">${a.model_title}</h3>
            <${ModelLine} a=${a} />

            <h3 class="about-section-title">${a.github_title}</h3>
            <a class="about-github" href=${GITHUB_URL} target="_blank" rel="noopener noreferrer">
              ${a.github_label}
            </a>
          `}
        </div>
      </div>
    </div>
  `;
}
