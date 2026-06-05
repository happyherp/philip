// Philip's persona, conversation model, and the single tool he uses to fetch
// verified scripture. Distilled from README.md (posture) and original-prompt.md
// (the walk-through-the-Bible conversation model that worked in practice).
//
// Prompts live in src/prompts/*.md for readability; Wrangler bundles them as
// text modules (see [[rules]] in wrangler.toml).

import BASE_PROMPT from "./prompts/base.md";
import ES_OVERRIDES from "./prompts/es.md";
import DE_OVERRIDES from "./prompts/de.md";

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
      },
      required: ["reference"],
    },
  },
};

export function buildSystemPrompt(lang: string): string {
  if (lang === "es") return BASE_PROMPT + "\n\n" + ES_OVERRIDES;
  if (lang === "de") return BASE_PROMPT + "\n\n" + DE_OVERRIDES;
  return BASE_PROMPT;
}

export const SYSTEM_PROMPT = BASE_PROMPT;
