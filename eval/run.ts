#!/usr/bin/env npx tsx
/**
 * eval/run.ts — Model × Prompt × Scenario comparison harness for Philip.
 *
 * Runs every combination of (scenario, prompt variant, model) against the
 * real OpenRouter API with Philip's tool loop and saves responses + a
 * side-by-side markdown report.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx tsx eval/run.ts
 *
 * Optional env:
 *   EVAL_MODELS   — comma-separated model ids (default: both Claude + Grok)
 *   EVAL_PROMPTS  — comma-separated prompt variant keys (default: all)
 *   EVAL_SCENARIOS — comma-separated scenario keys (default: all)
 */

import { runChat } from "../src/openrouter.ts";
import { fileAssetFetch } from "../test/helpers.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scenarios, type Scenario } from "./scenarios.ts";
import { promptVariants, type PromptVariant } from "./prompts.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error("Set OPENROUTER_API_KEY to run the eval.");
  process.exit(1);
}

const DEFAULT_MODELS = ["anthropic/claude-sonnet-4", "x-ai/grok-4.20"];

const models = process.env.EVAL_MODELS?.split(",").map((s) => s.trim()) ?? DEFAULT_MODELS;
const promptFilter = process.env.EVAL_PROMPTS?.split(",").map((s) => s.trim());
const scenarioFilter = process.env.EVAL_SCENARIOS?.split(",").map((s) => s.trim());

const selectedPrompts = promptFilter
  ? promptVariants.filter((p) => promptFilter.includes(p.key))
  : promptVariants;
const selectedScenarios = scenarioFilter
  ? scenarios.filter((s) => scenarioFilter.includes(s.key))
  : scenarios;

// ---------------------------------------------------------------------------
// Run one combination
// ---------------------------------------------------------------------------

interface Result {
  model: string;
  promptKey: string;
  scenarioKey: string;
  response: string;
  durationMs: number;
  error?: string;
}

async function runOne(
  model: string,
  prompt: PromptVariant,
  scenario: Scenario,
): Promise<Result> {
  const assets = fileAssetFetch();
  const history = scenario.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const t0 = Date.now();
  let response = "";
  try {
    const result = await runChat(history, {
      apiKey: API_KEY!,
      model,
      assetFetch: assets,
      systemPrompt: prompt.systemPrompt,
      translationId: "web",
      onToken: (t) => {
        response += t;
      },
      referer: "https://philip-eval.local",
      title: "Philip Eval",
    });
    response = result.text;
  } catch (err) {
    return {
      model,
      promptKey: prompt.key,
      scenarioKey: scenario.key,
      response: "",
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    model,
    promptKey: prompt.key,
    scenarioKey: scenario.key,
    response,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const outDir = join(process.cwd(), "eval", "results");
  await mkdir(outDir, { recursive: true });

  const total = models.length * selectedPrompts.length * selectedScenarios.length;
  console.log(
    `Running ${total} combinations: ${models.length} models × ${selectedPrompts.length} prompts × ${selectedScenarios.length} scenarios\n`,
  );

  const results: Result[] = [];

  for (const scenario of selectedScenarios) {
    for (const prompt of selectedPrompts) {
      for (const model of models) {
        const label = `${scenario.key} | ${prompt.key} | ${model}`;
        process.stdout.write(`  ▸ ${label} … `);
        const r = await runOne(model, prompt, scenario);
        results.push(r);
        if (r.error) {
          console.log(`ERROR (${r.durationMs}ms): ${r.error}`);
        } else {
          console.log(`OK (${r.durationMs}ms, ${r.response.length} chars)`);
        }
      }
    }
  }

  // Save individual responses
  for (const r of results) {
    const slug = `${r.scenarioKey}__${r.promptKey}__${r.model.replace("/", "_")}`;
    const path = join(outDir, `${slug}.md`);
    const header = [
      `# ${r.scenarioKey} | ${r.promptKey} | ${r.model}`,
      ``,
      `Duration: ${r.durationMs}ms`,
      r.error ? `Error: ${r.error}` : "",
      ``,
      `---`,
      ``,
    ]
      .filter(Boolean)
      .join("\n");
    await writeFile(path, header + r.response + "\n");
  }

  // Generate side-by-side comparison report
  const report = buildReport(results);
  const reportPath = join(outDir, "_comparison.md");
  await writeFile(reportPath, report);

  console.log(`\nResults saved to eval/results/`);
  console.log(`Comparison report: eval/results/_comparison.md`);
}

function buildReport(results: Result[]): string {
  const lines: string[] = [
    "# Philip — Model × Prompt Comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "---",
    "",
  ];

  for (const scenario of selectedScenarios) {
    lines.push(`## Scenario: ${scenario.key}`);
    lines.push("");
    lines.push(`> ${scenario.description}`);
    lines.push("");
    lines.push("**User messages:**");
    for (const m of scenario.messages) {
      lines.push(`- [${m.role}] ${m.content}`);
    }
    lines.push("");

    for (const prompt of selectedPrompts) {
      lines.push(`### Prompt: ${prompt.key}`);
      lines.push("");
      lines.push(`> ${prompt.description}`);
      lines.push("");

      for (const model of models) {
        const r = results.find(
          (x) =>
            x.scenarioKey === scenario.key &&
            x.promptKey === prompt.key &&
            x.model === model,
        );
        lines.push(`#### ${model} (${r?.durationMs ?? "?"}ms)`);
        lines.push("");
        if (r?.error) {
          lines.push(`**Error:** ${r.error}`);
        } else {
          lines.push(r?.response ?? "_no result_");
        }
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
