// Shared types for the developer-run eval suite. See eval/README.md.

import type { ChatMessage } from "../src/openrouter.ts";

export type Lang = "en" | "es" | "de";

/** One evaluation scenario: scripted context plus live user turns. */
export interface Scenario {
  id: string;
  /** Grouping label shown in the report (e.g. "reading", "pastoral"). */
  category: string;
  /** Restrict this scenario to specific languages (default: runs in every selected lang). */
  langs?: Lang[];
  /**
   * Scripted prior turns (deterministic canned history), so mid-conversation
   * behaviour can be evaluated without paying for live lead-up turns.
   */
  seedHistory?: ChatMessage[];
  /** Live user messages, sent sequentially; the model answers each one. Usually one. */
  turns: string[];
  /** What to look for when reviewing manually — shown alongside responses in the report. */
  notes?: string;
}

/** A concrete choice on every axis of the matrix. */
export interface AxisSelection {
  models: string[];
  /** Prompt variant names (keys of PROMPT_VARIANTS). */
  prompts: string[];
  langs: Lang[];
  /** Scenario ids to run. */
  scenarios: string[];
  /** luther-mcp semantic search: [false], [true] or [false, true]. */
  search: boolean[];
  /** How many times to repeat each permutation (responses are non-deterministic). */
  repeat: number;
  concurrency: number;
}

/** One cell of the expanded matrix — a single run. */
export interface RunSpec {
  runId: string;
  model: string;
  promptName: string;
  lang: Lang;
  scenarioId: string;
  search: boolean;
  repeatIndex: number;
}

export interface ToolLogEntry {
  /** Index of the live turn during which the call happened. */
  turn: number;
  tool: "get_passage" | "search_scripture";
  /** Human-readable detail: "John 3:1-8 @web" or the search query. */
  detail: string;
}

export interface TurnRecord {
  user: string;
  assistant: string;
  /** Wall time for the whole turn (all tool-loop rounds). */
  ms: number;
  /** Time to first streamed token of the final answer, if any. */
  ttftMs?: number;
}

/** Token usage summed across every HTTP round of a run (all turns, all tool loops). */
export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Number of HTTP rounds (tool-loop iterations across all turns, incl. retries). */
  rounds: number;
}

export type CostSource = "openrouter" | "pricing-table" | "unavailable";

export interface RunRecord {
  spec: RunSpec;
  turns: TurnRecord[];
  toolLog: ToolLogEntry[];
  usage: UsageTotals;
  /** Actual dollars spent, as reported by OpenRouter (or estimated — see costSource). */
  costUsd: number | null;
  /**
   * Cost with prompt-cache discounts removed (all prompt tokens priced at the
   * full rate). Use this to compare configurations fairly: raw cost makes
   * whichever config happened to run second look cheaper.
   */
  normalizedCostUsd: number | null;
  costSource: CostSource;
  /** Total wall time across all live turns. */
  wallMs: number;
  error: string | null;
  startedAt: string;
}

export interface Manifest {
  createdAt: string;
  gitSha: string;
  argv: string[];
  selection: AxisSelection;
  specCount: number;
}
