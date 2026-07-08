// Eval matrix configuration: models, system-prompt variants and named experiments.
//
// Edit this file to add models or prompt variants. Prefer running a named
// experiment (one or two axes varied, the rest pinned) over the full cartesian
// product — see eval/README.md for why.

import { buildSystemPrompt } from "../src/philip.ts";
import { SCENARIOS } from "./scenarios.ts";
import type { AxisSelection, Lang } from "./types.ts";

/** Same default as production (functions/api/chat.ts). */
export const DEFAULT_MODEL = "~anthropic/claude-sonnet-latest";

/**
 * Models worth comparing. Any OpenRouter model id works, but it MUST support
 * tool calling (the get_passage loop) or every run will fail.
 */
export const COMPARE_MODELS = [
  DEFAULT_MODEL,
  "~anthropic/claude-haiku-latest",
];

export type PromptVariant = (lang: string, searchEnabled: boolean) => string;

/**
 * Named system-prompt variants. `base` is exactly what production uses.
 * Variants should build on buildSystemPrompt() so they stay in sync with the
 * real prompt — append/transform rather than fork the whole text.
 */
export const PROMPT_VARIANTS: Record<string, PromptVariant> = {
  base: (lang, search) => buildSystemPrompt(lang, search),

  // Example variant showing the pattern: does an extra style rule change pacing?
  concise: (lang, search) =>
    buildSystemPrompt(lang, search) +
    "\n\n# ADDITIONAL RULE\nKeep the prose of every reply under 100 words (quote markers excluded).",
};

export const ALL_LANGS: Lang[] = ["en", "es", "de"];

const ALL_SCENARIO_IDS = SCENARIOS.map((s) => s.id);

/** Defaults every experiment starts from; CLI flags override the result. */
export const BASE_SELECTION: AxisSelection = {
  models: [DEFAULT_MODEL],
  prompts: ["base"],
  langs: ["en"],
  scenarios: ALL_SCENARIO_IDS,
  search: [false],
  repeat: 1,
  concurrency: 4,
};

/**
 * Named experiments: each pins most axes and varies one or two, so results
 * stay cheap and interpretable. Run with `npm run eval -- --experiment=NAME`.
 */
export const EXPERIMENTS: Record<string, Partial<AxisSelection>> = {
  /** Smoke-test slice: 1 model, base prompt, English, search off, 4 core scenarios. */
  quick: {
    scenarios: ["greeting-start", "read-john-3", "retype-trap", "off-topic"],
  },

  /** Compare models on everything else held at production defaults. */
  models: {
    models: COMPARE_MODELS,
  },

  /** How does behaviour hold up across languages? */
  languages: {
    langs: ALL_LANGS,
    scenarios: [
      "greeting-start",
      "wrong-language",
      "spanish-psalm",
      "german-john-1",
      "read-john-3",
    ],
  },

  /** A/B: luther-mcp search on vs off, on the scenarios where it matters. */
  "search-ab": {
    search: [false, true],
    scenarios: [
      "search-love-enemies",
      "search-anxiety-pastoral",
      "theology-born-again",
    ],
  },

  /** Compare all system-prompt variants. */
  prompts: {
    prompts: Object.keys(PROMPT_VARIANTS),
  },

  /** Everything × everything. Check the --dry-run call count before running! */
  full: {
    models: COMPARE_MODELS,
    prompts: Object.keys(PROMPT_VARIANTS),
    langs: ALL_LANGS,
    scenarios: ALL_SCENARIO_IDS,
    search: [false, true],
  },
};
