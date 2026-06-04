// Supported Bible translations, keyed by language code.
// Each translation maps to a subdirectory under public/bible/.

export interface TranslationMeta {
  id: string;
  name: string;
  fullName: string;
  lang: string;
}

export const TRANSLATIONS: TranslationMeta[] = [
  { id: "web", name: "WEB", fullName: "World English Bible", lang: "en" },
  { id: "rv1909", name: "RV1909", fullName: "Reina-Valera 1909", lang: "es" },
  { id: "luther1545", name: "Luther 1545", fullName: "Luther Bibel 1545", lang: "de" },
];

const BY_LANG = new Map(TRANSLATIONS.map((t) => [t.lang, t]));
const BY_ID = new Map(TRANSLATIONS.map((t) => [t.id, t]));

export function translationForLang(lang: string): TranslationMeta {
  return BY_LANG.get(lang) ?? BY_LANG.get(lang.split("-")[0]) ?? TRANSLATIONS[0];
}

export function translationById(id: string): TranslationMeta {
  return BY_ID.get(id) ?? TRANSLATIONS[0];
}
