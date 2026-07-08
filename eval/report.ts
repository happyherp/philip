// Report generation: a self-contained report.html (side-by-side comparison
// matrix) plus a terminal summary table, both built from the run JSONs.
//
// Also a standalone CLI so a report can be regenerated without new API calls:
//   npm run eval:report -- eval/results/<timestamp>

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { scenarioById } from "./scenarios.ts";
import type { Manifest, RunRecord } from "./types.ts";

/** The four config axes that identify a column in the comparison matrix. */
function configKey(r: RunRecord): string {
  return `${r.spec.model} · ${r.spec.promptName} · ${r.spec.lang} · ${r.spec.search ? "search" : "no-search"}`;
}

function fmtUsd(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(4)}`;
}

function fmtMs(n: number | null | undefined): string {
  return n == null ? "—" : `${(n / 1000).toFixed(1)}s`;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ConfigAggregate {
  key: string;
  runs: number;
  errors: number;
  totalCostUsd: number | null;
  avgCostUsd: number | null;
  avgNormalizedCostUsd: number | null;
  avgWallMs: number | null;
  avgTtftMs: number | null;
  avgTotalTokens: number | null;
  cacheReadTokens: number;
  getPassageCalls: number;
  searchCalls: number;
}

function aggregate(records: RunRecord[]): ConfigAggregate[] {
  const byConfig = new Map<string, RunRecord[]>();
  for (const r of records) {
    const key = configKey(r);
    (byConfig.get(key) ?? byConfig.set(key, []).get(key)!).push(r);
  }
  return [...byConfig.entries()].map(([key, runs]) => {
    const ok = runs.filter((r) => !r.error);
    const costs = ok.map((r) => r.costUsd).filter((c): c is number => c != null);
    const normalized = ok.map((r) => r.normalizedCostUsd).filter((c): c is number => c != null);
    const ttfts = ok.flatMap((r) => r.turns.map((t) => t.ttftMs)).filter((t): t is number => t != null);
    return {
      key,
      runs: runs.length,
      errors: runs.length - ok.length,
      totalCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      avgCostUsd: mean(costs),
      avgNormalizedCostUsd: mean(normalized),
      avgWallMs: mean(ok.map((r) => r.wallMs)),
      avgTtftMs: mean(ttfts),
      avgTotalTokens: mean(ok.map((r) => r.usage.totalTokens)),
      cacheReadTokens: ok.reduce((a, r) => a + r.usage.cacheReadTokens, 0),
      getPassageCalls: ok.reduce((a, r) => a + r.toolLog.filter((t) => t.tool === "get_passage").length, 0),
      searchCalls: ok.reduce((a, r) => a + r.toolLog.filter((t) => t.tool === "search_scripture").length, 0),
    };
  });
}

// --- HTML ------------------------------------------------------------------

export function buildHtmlReport(manifest: Manifest, records: RunRecord[]): string {
  const aggs = aggregate(records);
  const configs = aggs.map((a) => a.key);
  const scenarioIds = [...new Set(records.map((r) => r.spec.scenarioId))];
  const totalCost = records.reduce((a, r) => a + (r.costUsd ?? 0), 0);

  const aggRows = aggs
    .map(
      (a) => `<tr>
  <td class="cfg">${escapeHtml(a.key)}</td>
  <td>${a.runs}${a.errors ? ` <span class="err">(${a.errors} failed)</span>` : ""}</td>
  <td>${fmtUsd(a.totalCostUsd)}</td>
  <td>${fmtUsd(a.avgCostUsd)}</td>
  <td>${fmtUsd(a.avgNormalizedCostUsd)}</td>
  <td>${fmtMs(a.avgWallMs)}</td>
  <td>${fmtMs(a.avgTtftMs)}</td>
  <td>${a.avgTotalTokens == null ? "—" : Math.round(a.avgTotalTokens)}</td>
  <td>${a.cacheReadTokens}</td>
  <td>${a.getPassageCalls} / ${a.searchCalls}</td>
</tr>`,
    )
    .join("\n");

  const matrixRows = scenarioIds
    .map((sid) => {
      const scenario = scenarioById(sid);
      const cells = configs
        .map((cfg) => {
          const cellRuns = records.filter((r) => r.spec.scenarioId === sid && configKey(r) === cfg);
          if (cellRuns.length === 0) return `<td class="empty">—</td>`;
          return `<td>${cellRuns.map(renderRun).join("\n")}</td>`;
        })
        .join("\n");
      const notes = scenario?.notes
        ? `<div class="notes">${escapeHtml(scenario.notes)}</div>`
        : "";
      return `<tr>
  <th class="scenario"><div>${escapeHtml(sid)}</div><div class="cat">${escapeHtml(scenario?.category ?? "")}</div>${notes}</th>
  ${cells}
</tr>`;
    })
    .join("\n");

  const headerCells = configs.map((c) => `<th class="cfg">${escapeHtml(c)}</th>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Philip eval — ${escapeHtml(manifest.createdAt)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.45 system-ui, sans-serif; margin: 1.5rem; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  .meta { color: gray; font-size: 0.85rem; }
  table { border-collapse: collapse; margin-top: 0.75rem; }
  th, td { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  .wrap { overflow-x: auto; }
  .cfg { font-family: ui-monospace, monospace; font-size: 0.8rem; max-width: 16rem; }
  .scenario { min-width: 14rem; max-width: 18rem; }
  .scenario .cat { color: gray; font-size: 0.75rem; }
  .notes { font-size: 0.75rem; color: gray; margin-top: 0.35rem; font-style: italic; }
  .run { margin-bottom: 0.5rem; min-width: 20rem; max-width: 34rem; }
  .stats { font-family: ui-monospace, monospace; font-size: 0.75rem; color: gray; }
  .err { color: #c0392b; font-weight: 600; }
  details > summary { cursor: pointer; }
  .turn { margin: 0.5rem 0; }
  .turn .who { font-weight: 600; font-size: 0.8rem; }
  .turn pre { white-space: pre-wrap; word-break: break-word; background: color-mix(in srgb, currentColor 6%, transparent); padding: 0.5rem; border-radius: 6px; margin: 0.2rem 0; font-size: 0.85rem; }
  .tools { font-size: 0.75rem; color: gray; font-family: ui-monospace, monospace; }
  .badge { display: inline-block; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 999px; padding: 0 0.5rem; font-size: 0.72rem; margin-right: 0.25rem; }
</style>
</head>
<body>
<h1>Philip eval report</h1>
<p class="meta">
  ${escapeHtml(manifest.createdAt)} · git ${escapeHtml(manifest.gitSha.slice(0, 10))} ·
  ${records.length} runs · total cost ${fmtUsd(totalCost)} ·
  argv: <code>${escapeHtml(manifest.argv.join(" "))}</code>
</p>

<h2>Configurations compared</h2>
<div class="wrap"><table>
<thead><tr>
  <th>config (model · prompt · lang · search)</th><th>runs</th><th>total cost</th>
  <th>avg cost</th><th>avg cost (normalized*)</th><th>avg time</th><th>avg first token</th>
  <th>avg tokens</th><th>cache-read tok</th><th>passage / search calls</th>
</tr></thead>
<tbody>
${aggRows}
</tbody>
</table></div>
<p class="meta">* normalized = cache discounts removed (pricing-table estimate); compare configs on this number, not raw cost.</p>

<h2>Side-by-side responses</h2>
<div class="wrap"><table>
<thead><tr><th>scenario</th>${headerCells}</tr></thead>
<tbody>
${matrixRows}
</tbody>
</table></div>
</body>
</html>
`;
}

function renderRun(r: RunRecord): string {
  const label = r.spec.repeatIndex > 0 ? `run ${r.spec.repeatIndex + 1}` : "run 1";
  const stats = `${fmtUsd(r.costUsd)}${r.costSource !== "openrouter" ? ` (${r.costSource})` : ""} · ${fmtMs(r.wallMs)} · ${r.usage.totalTokens} tok · ${r.usage.rounds} rounds`;
  if (r.error) {
    return `<div class="run"><span class="err">ERROR</span> <span class="stats">${escapeHtml(label)}</span>
<pre>${escapeHtml(r.error)}</pre></div>`;
  }
  const tools = r.toolLog.length
    ? `<div class="tools">${r.toolLog
        .map((t) => `<span class="badge">${t.tool === "get_passage" ? "📖" : "🔍"} ${escapeHtml(t.detail)}</span>`)
        .join(" ")}</div>`
    : "";
  const turns = r.turns
    .map(
      (t) => `<div class="turn"><div class="who">user</div><pre>${escapeHtml(t.user)}</pre>
<div class="who">assistant <span class="stats">(${fmtMs(t.ms)}${t.ttftMs != null ? `, first token ${fmtMs(t.ttftMs)}` : ""})</span></div><pre>${escapeHtml(t.assistant)}</pre></div>`,
    )
    .join("\n");
  const usage = `prompt ${r.usage.promptTokens} (cache read ${r.usage.cacheReadTokens}, write ${r.usage.cacheWriteTokens}) · completion ${r.usage.completionTokens}`;
  return `<div class="run"><details><summary>${escapeHtml(label)} — <span class="stats">${escapeHtml(stats)}</span></summary>
${tools}
${turns}
<div class="stats">${escapeHtml(usage)}</div>
</details></div>`;
}

// --- CLI summary -------------------------------------------------------------

export function buildCliSummary(records: RunRecord[]): string {
  const aggs = aggregate(records);
  const headers = ["config", "runs", "total $", "avg $", "avg $ norm", "avg time", "tok avg", "fails"];
  const rows = aggs.map((a) => [
    a.key,
    String(a.runs),
    fmtUsd(a.totalCostUsd),
    fmtUsd(a.avgCostUsd),
    fmtUsd(a.avgNormalizedCostUsd),
    fmtMs(a.avgWallMs),
    a.avgTotalTokens == null ? "—" : String(Math.round(a.avgTotalTokens)),
    String(a.errors),
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

// --- Loading + standalone entry point ---------------------------------------

export async function loadResults(dir: string): Promise<{ manifest: Manifest; records: RunRecord[] }> {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as Manifest;
  const runsDir = join(dir, "runs");
  const files = (await readdir(runsDir)).filter((f) => f.endsWith(".json")).sort();
  const records: RunRecord[] = [];
  for (const f of files) {
    records.push(JSON.parse(await readFile(join(runsDir, f), "utf8")) as RunRecord);
  }
  return { manifest, records };
}

export async function writeReport(dir: string, manifest: Manifest, records: RunRecord[]): Promise<string> {
  const file = join(dir, "report.html");
  await writeFile(file, buildHtmlReport(manifest, records));
  return file;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: npm run eval:report -- eval/results/<timestamp>");
    process.exit(1);
  }
  const { manifest, records } = await loadResults(dir);
  const file = await writeReport(dir, manifest, records);
  console.log(buildCliSummary(records));
  console.log(`\nreport: ${file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
