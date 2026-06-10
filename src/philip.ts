// Philip's persona, conversation model, and the single tool he uses to fetch
// verified scripture. Distilled from README.md (posture) and original-prompt.md
// (the walk-through-the-Bible conversation model that worked in practice).
//
// The unified prompt lives in src/prompts/base.md for readability; Wrangler
// bundles it as a text module (see [[rules]] in wrangler.toml). Language-
// specific overrides are no longer needed — the model chooses its language and
// Bible translation dynamically based on what the reader writes.

import BASE_PROMPT from "./prompts/base.md";

export const GET_PASSAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_passage",
    description:
      "Fetch the exact Bible text for a passage. ALWAYS call " +
      "this before quoting any scripture. Never write verse text from memory.",
    parameters: {
      type: "object",
      properties: {
        reference: {
          type: "string",
          description:
            'A passage reference such as "John 8:31-32", "Psalm 23", "1 John 1:9", ' +
            'or a cross-chapter range like "John 8:31-9:2". Keep it to a few verses ' +
            "at a time for reading; request more only when genuinely needed.",
        },
        translation: {
          type: "string",
          enum: ["web", "rv1909", "luther1545"],
          description:
            "Which Bible translation to use. " +
            '"web" = World English Bible (English), ' +
            '"rv1909" = Reina-Valera 1909 (Spanish), ' +
            '"luther1545" = Luther 1545 (German). ' +
            "Choose the translation that matches the language you are speaking to the reader in. " +
            "Defaults to the reader's initial language if omitted.",
        },
      },
      required: ["reference"],
    },
  },
};

const LANG_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish (español)",
  de: "German (Deutsch)",
};

export function buildSystemPrompt(lang: string): string {
  const label = LANG_LABELS[lang] ?? LANG_LABELS.en;
  return BASE_PROMPT.replace("INITIAL_LANG", label);
}

export const SYSTEM_PROMPT = buildSystemPrompt("en");
