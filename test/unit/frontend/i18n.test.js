import { describe, it, expect } from "vitest";
import { I18N, detectLang, getStrings } from "../../../public/i18n.js";

const LANGS = Object.keys(I18N);
const BASE = "en";
const baseKeys = Object.keys(I18N[BASE]);

describe("i18n completeness", () => {
  for (const lang of LANGS.filter((l) => l !== BASE)) {
    it(`${lang} has every key that en has`, () => {
      const missing = baseKeys.filter((k) => !(k in I18N[lang]));
      expect(missing, `Missing keys in ${lang}`).toEqual([]);
    });

    it(`${lang} has no keys that en does not have`, () => {
      const extra = Object.keys(I18N[lang]).filter((k) => !(k in I18N[BASE]));
      expect(extra, `Superfluous keys in ${lang}`).toEqual([]);
    });
  }
});

describe("detectLang", () => {
  it("returns 'en' for English locales", () => {
    expect(detectLang()).toBe("en"); // jsdom default is 'en'
  });
});

describe("getStrings", () => {
  it("returns en strings for an unknown language", () => {
    expect(getStrings("xx")).toEqual(I18N.en);
  });

  it("returns the correct strings for each supported language", () => {
    for (const lang of LANGS) {
      expect(getStrings(lang)).toEqual(I18N[lang]);
    }
  });
});
