// Supported Bible translations, keyed by language code.
// Each translation maps to a subdirectory under public/bible/.

import { type BookMeta, isOldTestament } from "./books.ts";

export interface TranslationMeta {
  id: string;
  name: string;
  fullName: string;
  lang: string;
  /** Which part of the 66-book canon exists on disk. */
  coverage: "full" | "ot" | "nt";
  /** Text direction; only set for right-to-left scripts (Hebrew). */
  dir?: "rtl";
  /** Original-language/study texts: never picked as a reader-language default. */
  scholarly?: boolean;
  /**
   * "Read in context" portal for quote links. BibleGateway where it carries
   * the text (the portal most readers know); STEP Bible for the scholarly
   * texts it alone has exactly (Tischendorf, LXX).
   */
  link?: { portal: "biblegateway" | "step"; version: string };
}

export const TRANSLATIONS: TranslationMeta[] = [
  { id: "web", name: "WEB", fullName: "World English Bible", lang: "en", coverage: "full", link: { portal: "biblegateway", version: "WEB" } },
  { id: "rv1909", name: "RV1909", fullName: "Reina-Valera 1909", lang: "es", coverage: "full", link: { portal: "biblegateway", version: "RVA" } },
  { id: "luther1545", name: "Luther 1545", fullName: "Luther Bibel 1545", lang: "de", coverage: "full", link: { portal: "biblegateway", version: "LUTH1545" } },
  { id: "tisch", name: "Tischendorf", fullName: "Tischendorf 8th Edition (Greek New Testament)", lang: "grc", coverage: "nt", scholarly: true, link: { portal: "step", version: "Tisch" } },
  { id: "wlc", name: "WLC", fullName: "Westminster Leningrad Codex (Hebrew Old Testament)", lang: "hbo", coverage: "ot", dir: "rtl", scholarly: true, link: { portal: "biblegateway", version: "WLC" } },
  { id: "lxx", name: "LXX", fullName: "Septuagint (Greek Old Testament)", lang: "grc", coverage: "ot", scholarly: true, link: { portal: "step", version: "LXX" } },
  { id: "vul", name: "Vulgata", fullName: "Clementine Vulgate (Latin)", lang: "la", coverage: "full", scholarly: true, link: { portal: "biblegateway", version: "VULGATE" } },
];

const BY_LANG = new Map(
  TRANSLATIONS.filter((t) => !t.scholarly).map((t) => [t.lang, t]),
);
const BY_ID = new Map(TRANSLATIONS.map((t) => [t.id, t]));

export function translationForLang(lang: string): TranslationMeta {
  return BY_LANG.get(lang) ?? BY_LANG.get(lang.split("-")[0]) ?? TRANSLATIONS[0];
}

export function translationById(id: string): TranslationMeta | undefined {
  return BY_ID.get(id);
}

/** Whether a translation's bundled data contains the given book. */
export function translationCoversBook(meta: TranslationMeta, book: BookMeta): boolean {
  if (meta.coverage === "full") return true;
  return meta.coverage === "ot" ? isOldTestament(book) : !isOldTestament(book);
}
