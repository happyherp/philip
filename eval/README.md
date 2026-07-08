# Eval suite

A developer-run harness for comparing how different configurations affect
Philip's responses. It calls `runChat()` from `src/openrouter.ts` directly (no
server needed) across permutations of five axes, in parallel, and produces a
side-by-side HTML report with **cost, time taken, tokens and tool calls** per
run. Comparison is manual — the report puts responses next to each other; you
judge quality yourself.

## Axes

| Axis | Where defined | Values |
| --- | --- | --- |
| model | `config.ts` / `--models` | any OpenRouter id that supports tool calling |
| system prompt | `PROMPT_VARIANTS` in `config.ts` | named variants built on `buildSystemPrompt()` |
| language | `--langs` | `en`, `es`, `de` (also picks the translation) |
| user prompt | `scenarios.ts` | ~14 scenarios, incl. multi-turn and scripted history |
| luther-mcp search | `--search` | off / on (changes tool set **and** prompt wording) |

## Running

```bash
export OPENROUTER_API_KEY=sk-or-...   # or copy it from .dev.vars

npm run eval                          # default: the cheap "quick" experiment
npm run eval -- --experiment=models   # named experiments: quick, models, languages,
                                      #   search-ab, prompts, full
npm run eval -- --dry-run --experiment=full     # print the run count, spend nothing
npm run eval -- --scenarios=read-john-3 --models=~anthropic/claude-haiku-latest \
                --search=both --repeat=3 --concurrency=6
npm run eval:report -- eval/results/<timestamp> # regenerate report.html offline
```

Results land in `eval/results/<timestamp>/` (gitignored): `manifest.json`
(git sha, config), `runs/*.json` (one per permutation, written immediately so
a crash loses nothing), and `report.html` (self-contained — open it in a
browser).

## Adding things

- **Scenario**: append to `SCENARIOS` in `scenarios.ts`. Use `seedHistory` for
  scripted prior turns (cheap, deterministic) and `notes` to tell your future
  self what to look for.
- **Prompt variant**: add to `PROMPT_VARIANTS` in `config.ts`; build on
  `buildSystemPrompt()` so variants track the production prompt.
- **Experiment**: add to `EXPERIMENTS` in `config.ts` — pin most axes, vary one
  or two.

## Pitfalls (read before trusting a comparison)

1. **Non-determinism.** `runChat` sets no `temperature`, so responses vary
   between identical runs. A single run per config is noise — use
   `--repeat=3` before concluding anything.
2. **Prompt-cache pollution.** Requests set Anthropic-style `cache_control`
   breakpoints; configs that share a prompt prefix with an earlier run get
   cache discounts and look artificially cheap. Compare the **normalized**
   cost column (cache discounts removed), not raw cost. Raw cost is still
   shown — it's what you actually paid.
3. **Matrix explosion.** Five axes multiply fast (the `full` experiment is
   hundreds of runs, multi-turn scenarios make several model calls each).
   Always check `--dry-run` first; prefer named experiments that vary one or
   two axes.
4. **30-second request timeout** inside `runChat`. Very slow models trip it;
   the runner retries twice with backoff, then records the run as an error.
5. **Cold search Space.** With `--search=on|both`, the hosted luther-mcp
   HuggingFace Space is probed and woken first — the first session of the day
   can take a couple of minutes to start.
6. **Rate limits / credits.** 429s and 5xxs are retried with backoff. An HTTP
   402 (out of OpenRouter credits) aborts the whole session; finished runs
   are kept.
7. **Cost source.** `costUsd` comes from OpenRouter's own accounting
   (`usage: {include: true}`) when available; otherwise it's estimated from
   the public pricing table (marked `pricing-table` in the report) and
   ignores cache discounts. Retried rounds count toward cost — it's real
   money spent.
8. **No automated scoring (by choice).** Run JSONs contain full transcripts
   and tool logs, and `eval:report` re-processes them offline — automated
   checks or an LLM judge can be added later without re-running anything.

## Known quirk in `src/`

`runChat` aggregates usage across tool-loop rounds with `Object.assign`
(src/openrouter.ts), so its returned `usage` only reflects the final round.
The eval doesn't rely on it — the instrumented fetch in `cost.ts` sums every
round itself. Worth fixing in `src/` separately someday.
