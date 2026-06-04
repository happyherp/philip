# Philip — Setup & Development

Philip's MVP is a website: a static frontend (`public/`) plus one Cloudflare
Pages Function (`functions/api/chat.ts`) that talks to OpenRouter and grounds
every quotation in the **bundled World English Bible** (`public/bible/web/*.json`)
— no Bible API is called at runtime.

## Prerequisites

- Node 22+
- An [OpenRouter](https://openrouter.ai) API key

## Install

```bash
npm install
```

## Secrets

Local secrets live in `.dev.vars` (gitignored):

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2.5-flash   # optional; any tool-calling model on OpenRouter
```

> The model **must support tool calling** (Philip uses a `get_passage` tool).

## Regenerate bundled assets (optional)

These are committed, so you normally don't need to run them. To refresh:

```bash
npm run build:bible      # downloads WEB and writes public/bible/web/*.json
npm run vendor:marked    # pins the markdown renderer into public/frontend/vendor
```

## Run locally

```bash
npm run dev              # wrangler pages dev public  ->  http://localhost:8788
```

Open the URL and read with Philip: try “John 8:31”, then “continue”, then ask a
question.

## Tests

```bash
npm test                 # backend + frontend unit tests (no network)
npm run typecheck        # tsc --noEmit
RUN_INTEGRATION=1 npm run test:integration   # live OpenRouter (needs the key)
npm run test:all         # everything
```

- **Backend unit** (`test/unit/*.ts`): reference parser, passage lookup against
  the real bundled JSON, the OpenRouter tool loop (with canned SSE streams), and
  the SSE handler — all with mocked fetch, no network.
- **Frontend unit** (`test/unit/frontend/*.js`, jsdom): state reducer, markdown
  rendering + HTML sanitization, and the SSE client.
- **Integration** (`test/integration/*.ts`): real OpenRouter streaming, and the
  key guarantee that Philip quotes the **exact** bundled WEB text via the tool
  (no hallucinated scripture). Skipped unless `RUN_INTEGRATION=1` and a key are
  set.

## Deploy (Cloudflare Pages)

```bash
npx wrangler login
npm run deploy                                   # wrangler pages deploy public
npx wrangler pages secret put OPENROUTER_API_KEY # set the server secret
# optional:
npx wrangler pages secret put OPENROUTER_MODEL
```

Cloudflare Pages scales to zero — you only pay (nothing, on the free tier) when
someone is actually reading.

## Architecture notes

- `src/bible.ts`, `src/philip.ts`, `src/openrouter.ts`, `src/chat.ts` are
  transport-agnostic and dependency-injected (fetch + asset lookup are passed
  in). The Pages Function is a thin wrapper. A future **WhatsApp** webhook can
  reuse the same `src/` modules unchanged.
- Scripture is fetched per-book at request time from the bundled JSON via the
  `get_passage` tool, so the model never invents verse text.
