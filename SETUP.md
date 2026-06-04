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

### One-off / manual deploy

```bash
npx wrangler login
npm run deploy                                   # wrangler pages deploy public
npx wrangler pages secret put OPENROUTER_API_KEY # set the server secret
# optional:
npx wrangler pages secret put OPENROUTER_MODEL
```

### Continuous deployment (GitHub Actions)

Pushes to `main` (and manual runs via "Run workflow") automatically deploy via
`.github/workflows/deploy.yml`. The workflow runs typecheck + tests + integration
tests (if the key is available) before deploying.

Required GitHub repository secret:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with **Account > Cloudflare Pages > Edit** permission.

Create the token:
1. Cloudflare dashboard → profile icon → **My Profile** → **API Tokens** → **Create Token**.
2. Choose **Custom token**.
3. Permissions: **Account** | **Cloudflare Pages** | **Edit**.
4. (Optional but recommended) Restrict to the specific account that owns the Pages project.
5. Create and copy the token.
6. In your GitHub repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name it `CLOUDFLARE_API_TOKEN`.

You can also keep `OPENROUTER_API_KEY` as a GitHub secret (already used by the
integration test job in CI). On successful deploys the live site will use the
Pages secret you set with `wrangler pages secret put` (or the dashboard).

Cloudflare Pages scales to zero — you only pay (nothing, on the free tier) when
someone is actually reading.

## Architecture notes

- `src/bible.ts`, `src/philip.ts`, `src/openrouter.ts`, `src/chat.ts` are
  transport-agnostic and dependency-injected (fetch + asset lookup are passed
  in). The Pages Function is a thin wrapper. A future **WhatsApp** webhook can
  reuse the same `src/` modules unchanged.
- Scripture is fetched per-book at request time from the bundled JSON via the
  `get_passage` tool, so the model never invents verse text.
