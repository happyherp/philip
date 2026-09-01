// Eval runner: expands a configuration matrix (model × prompt × lang ×
// scenario × search), runs each permutation against OpenRouter in parallel,
// and writes per-run JSON + a side-by-side HTML report.
//
//   npm run eval -- [--experiment=quick] [--models=a,b] [--prompts=base]
//                   [--langs=en,es] [--scenarios=id1,id2] [--search=on|off|both]
//                   [--repeat=2] [--concurrency=4] [--dry-run] [--out=dir]
//
// Requires OPENROUTER_API_KEY in the environment. See eval/README.md.

import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runChat, InsufficientCreditsError, type ChatMessage } from "../src/openrouter.ts";
import { DEFAULT_LUTHER_SEARCH_URL, probeSearch } from "../src/search.ts";
import { translationForLang } from "../src/translations.ts";
import { getTestAttribution } from "../test/attribution.ts";
import { fileAssetFetch } from "../test/helpers.ts";
import { BASE_SELECTION, EXPERIMENTS, PROMPT_VARIANTS } from "./config.ts";
import { instrumentedFetch, loadPricing, summarizeCost, type PricingTable } from "./cost.ts";
import { isTransientError, runPool, sleep, withRetry } from "./pool.ts";
import { buildCliSummary, writeReport } from "./report.ts";
import { SCENARIOS, scenarioById } from "./scenarios.ts";
import type { AxisSelection, Lang, Manifest, RunRecord, RunSpec, ToolLogEntry, TurnRecord } from "./types.ts";

const RESULTS_ROOT = "eval/results";
const PRICING_CACHE = join(RESULTS_ROOT, ".cache", "models.json");

// --- CLI parsing -------------------------------------------------------------

function usage(): never {
  console.log(`Usage: npm run eval -- [options]

Options:
  --experiment=NAME    named experiment (${Object.keys(EXPERIMENTS).join(", ")}); default: quick
  --models=a,b         override model list (any tool-calling OpenRouter id)
  --prompts=a,b        override prompt variants (${Object.keys(PROMPT_VARIANTS).join(", ")})
  --langs=en,es,de     override languages
  --scenarios=id1,id2  override scenarios (${SCENARIOS.map((s) => s.id).join(", ")})
  --search=on|off|both override the luther-mcp search axis
  --repeat=N           repeat each permutation N times (default 1)
  --concurrency=N      parallel runs (default 4)
  --dry-run            print the expanded matrix and exit (no network)
  --out=DIR            results directory (default ${RESULTS_ROOT}/<timestamp>)
`);
  process.exit(0);
}

function csv(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function resolveSelection(): { selection: AxisSelection; dryRun: boolean; out?: string } {
  const { values } = parseArgs({
    options: {
      experiment: { type: "string" },
      models: { type: "string" },
      prompts: { type: "string" },
      langs: { type: "string" },
      scenarios: { type: "string" },
      search: { type: "string" },
      repeat: { type: "string" },
      concurrency: { type: "string" },
      "dry-run": { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) usage();

  const expName = values.experiment ?? "quick";
  const experiment = EXPERIMENTS[expName];
  if (!experiment) {
    throw new Error(`Unknown experiment "${expName}". Available: ${Object.keys(EXPERIMENTS).join(", ")}`);
  }

  const selection: AxisSelection = { ...BASE_SELECTION, ...experiment };
  if (values.models) selection.models = csv(values.models);
  if (values.prompts) selection.prompts = csv(values.prompts);
  if (values.langs) selection.langs = csv(values.langs) as Lang[];
  if (values.scenarios) selection.scenarios = csv(values.scenarios);
  if (values.search) {
    if (!["on", "off", "both"].includes(values.search)) {
      throw new Error(`--search must be on, off or both (got "${values.search}")`);
    }
    selection.search = values.search === "both" ? [false, true] : [values.search === "on"];
  }
  if (values.repeat) selection.repeat = Number(values.repeat);
  if (values.concurrency) selection.concurrency = Number(values.concurrency);

  for (const p of selection.prompts) {
    if (!PROMPT_VARIANTS[p]) throw new Error(`Unknown prompt variant "${p}". Available: ${Object.keys(PROMPT_VARIANTS).join(", ")}`);
  }
  for (const s of selection.scenarios) {
    if (!scenarioById(s)) throw new Error(`Unknown scenario "${s}". Available: ${SCENARIOS.map((x) => x.id).join(", ")}`);
  }
  for (const l of selection.langs) {
    if (!["en", "es", "de"].includes(l)) throw new Error(`Unknown lang "${l}" (en, es, de)`);
  }
  if (!Number.isInteger(selection.repeat) || selection.repeat < 1) throw new Error("--repeat must be a positive integer");
  if (!Number.isInteger(selection.concurrency) || selection.concurrency < 1) throw new Error("--concurrency must be a positive integer");

  return { selection, dryRun: Boolean(values["dry-run"]), out: values.out };
}

// --- Matrix expansion ----------------------------------------------------------

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function expandMatrix(sel: AxisSelection): RunSpec[] {
  const specs: RunSpec[] = [];
  for (const scenarioId of sel.scenarios) {
    const scenario = scenarioById(scenarioId)!;
    for (const lang of sel.langs) {
      // A scenario restricted to certain languages is skipped elsewhere.
      if (scenario.langs && !scenario.langs.includes(lang)) continue;
      for (const model of sel.models) {
        for (const promptName of sel.prompts) {
          for (const search of sel.search) {
            for (let repeatIndex = 0; repeatIndex < sel.repeat; repeatIndex++) {
              specs.push({
                runId: `${scenarioId}__${slug(model)}__${promptName}__${lang}__${search ? "search" : "nosearch"}__r${repeatIndex}`,
                model,
                promptName,
                lang,
                scenarioId,
                search,
                repeatIndex,
              });
            }
          }
        }
      }
    }
  }
  return specs;
}

// --- Single run ---------------------------------------------------------------

async function executeRun(spec: RunSpec, pricing: PricingTable, outDir: string): Promise<RunRecord> {
  const scenario = scenarioById(spec.scenarioId)!;
  const attribution = getTestAttribution();
  const assetFetch = fileAssetFetch();
  const systemPrompt = PROMPT_VARIANTS[spec.promptName](spec.lang, spec.search);
  const translationId = translationForLang(spec.lang).id;
  const meter = instrumentedFetch();

  const toolLog: ToolLogEntry[] = [];
  const history: ChatMessage[] = [...(scenario.seedHistory ?? [])];
  const turns: TurnRecord[] = [];
  const startedAt = new Date().toISOString();
  let error: string | null = null;

  try {
    for (const userMsg of scenario.turns) {
      history.push({ role: "user", content: userMsg });
      const turnIndex = turns.length;
      const t0 = Date.now();
      let firstTokenAt: number | undefined;

      const { text } = await withRetry(
        () => {
          firstTokenAt = undefined;
          return runChat(history, {
            apiKey: process.env.OPENROUTER_API_KEY!,
            model: spec.model,
            systemPrompt,
            translationId,
            searchUrl: spec.search ? DEFAULT_LUTHER_SEARCH_URL : undefined,
            assetFetch,
            fetchImpl: meter.fetchImpl,
            ...attribution,
            onToken: () => {
              firstTokenAt ??= Date.now();
            },
            onPassageRequest: (info) =>
              void toolLog.push({ turn: turnIndex, tool: "get_passage", detail: `${info.reference} @${info.translationId}` }),
            onSearchRequest: (info) =>
              void toolLog.push({ turn: turnIndex, tool: "search_scripture", detail: info.query }),
          });
        },
        {
          retries: 2,
          onRetry: (e, attempt) =>
            console.warn(`  retry ${attempt} for ${spec.runId}: ${e instanceof Error ? e.message : e}`),
        },
      );

      history.push({ role: "assistant", content: text });
      turns.push({
        user: userMsg,
        assistant: text,
        ms: Date.now() - t0,
        ttftMs: firstTokenAt != null ? firstTokenAt - t0 : undefined,
      });
    }
  } catch (e) {
    if (e instanceof InsufficientCreditsError) throw e; // fatal: abort the whole session
    error = e instanceof Error ? e.message : String(e);
  }

  const rounds = await meter.drain();
  const cost = summarizeCost(rounds, pricing, spec.model);
  const record: RunRecord = {
    spec,
    turns,
    toolLog,
    usage: cost.usage,
    costUsd: cost.costUsd,
    normalizedCostUsd: cost.normalizedCostUsd,
    costSource: cost.costSource,
    wallMs: turns.reduce((a, t) => a + t.ms, 0),
    error,
    startedAt,
  };
  // Written immediately so a crashed/aborted session keeps its finished runs.
  await writeFile(join(outDir, "runs", `${spec.runId}.json`), JSON.stringify(record, null, 2));
  return record;
}

// --- luther-mcp warm-up ---------------------------------------------------------

async function warmSearch(): Promise<void> {
  console.log(`waking luther-mcp search (${DEFAULT_LUTHER_SEARCH_URL}) ...`);
  for (let i = 0; i < 12; i++) {
    const probe = await probeSearch({ url: DEFAULT_LUTHER_SEARCH_URL, timeoutMs: 10_000 });
    if (probe.status === "ready") {
      console.log(`search ready (${probe.latencyMs} ms).`);
      return;
    }
    if (probe.status === "error") throw new Error(`luther-mcp unreachable: ${probe.detail}`);
    console.log(`  ${probe.detail} — retrying in 10s`);
    await sleep(10_000);
  }
  throw new Error("luther-mcp did not become ready within ~2 minutes");
}

// --- Main -----------------------------------------------------------------------

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const { selection, dryRun, out } = resolveSelection();
  const specs = expandMatrix(selection);

  console.log(
    `matrix: ${selection.models.length} model(s) × ${selection.prompts.length} prompt(s) × ` +
      `${selection.langs.length} lang(s) × ${selection.scenarios.length} scenario(s) × ` +
      `${selection.search.length} search mode(s) × repeat ${selection.repeat}` +
      ` → ${specs.length} runs (some scenarios are language-restricted)`,
  );
  if (specs.length === 0) {
    console.error("Nothing to run — check --langs against the scenarios' language restrictions.");
    process.exit(1);
  }
  if (dryRun) {
    for (const s of specs) console.log(`  ${s.runId}`);
    console.log(`\n${specs.length} runs. Multi-turn scenarios make more than one model call per run.`);
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set. Export it (or source .dev.vars) and retry.");
    process.exit(1);
  }

  if (specs.some((s) => s.search)) await warmSearch();
  const pricing = await loadPricing(PRICING_CACHE);

  const outDir = out ?? join(RESULTS_ROOT, new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(join(outDir, "runs"), { recursive: true });
  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    gitSha: gitSha(),
    argv: process.argv.slice(2),
    selection,
    specCount: specs.length,
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  let aborted: InsufficientCreditsError | null = null;
  let done = 0;
  const records = await runPool(
    specs,
    selection.concurrency,
    async (spec) => {
      try {
        const record = await executeRun(spec, pricing, outDir);
        done++;
        const status = record.error ? "ERROR" : `$${record.costUsd?.toFixed(4) ?? "?"} · ${(record.wallMs / 1000).toFixed(1)}s`;
        console.log(`[${done}/${specs.length}] ${spec.runId} — ${status}`);
        return record;
      } catch (e) {
        if (e instanceof InsufficientCreditsError) aborted = e;
        // Keep the pool alive: record the failure so the report shows it.
        const record: RunRecord = {
          spec,
          turns: [],
          toolLog: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, rounds: 0 },
          costUsd: null,
          normalizedCostUsd: null,
          costSource: "unavailable",
          wallMs: 0,
          error: e instanceof Error ? e.message : String(e),
          startedAt: new Date().toISOString(),
        };
        await writeFile(join(outDir, "runs", `${spec.runId}.json`), JSON.stringify(record, null, 2));
        return record;
      }
    },
    () => aborted != null,
  );

  if (aborted != null) {
    const err = aborted as InsufficientCreditsError;
    console.error(`\nAborted: OpenRouter reports insufficient credits.${err.refillUrl ? ` Refill: ${err.refillUrl}` : ""}`);
  }

  const reportFile = await writeReport(outDir, manifest, records);
  console.log("\n" + buildCliSummary(records));
  console.log(`\nresults: ${outDir}`);
  console.log(`report:  ${reportFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
