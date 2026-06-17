# Philip — Setup & Development

Philip's MVP is a website: a static frontend (`public/`) plus a few Cloudflare
Pages Functions (`functions/api/*`) that talk to OpenRouter and ground every
quotation in the **bundled World English Bible** (`public/bible/web/*.json`)
— no Bible API is called at runtime.

**Conversations live in the reader's browser**, not on the server. The full
history is kept in `localStorage` and sent with every `/api/chat` turn; the
server persists no conversation content. The only exception is the **explicit,
opt-in "share"** action (`POST /api/share`), which stores a snapshot the reader
deliberately chose to publish and returns a short, expiring link
(`/?c=<id>` → `GET /api/share/:id`). Snapshots expire after 30 days.

## Prerequisites

- Node 22+
- An [OpenRouter](https://openrouter.ai) API key

## Install

```bash
npm install
```

## Develop in a Docker container (with Grok)

Prefer to work in a container? A ready-to-use dev container with Node 22, the project
tooling, and the **Grok CLI** (`grok-build`) preinstalled and authenticated lives in
[`dev-container/`](dev-container/) — see [dev-container/README.md](dev-container/README.md).

```bash
cd dev-container
docker compose build
docker compose run --rm dev grok
```

## Secrets

Local secrets live in `.dev.vars` (gitignored):

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4   # optional; any tool-calling model on OpenRouter
MAX_MESSAGES_PER_CONVERSATION=200          # optional; per-conversation user-message cap
MAX_MESSAGES_PER_IP_PER_DAY=300            # optional; per-IP daily request cap
```

> The model **must support tool calling** (Philip uses a `get_passage` tool).

## Abuse protection (usage caps)

`/api/chat` is a public, unauthenticated endpoint that spends OpenRouter
credits, so it is bounded by **D1-backed usage caps**:

- per conversation: max user messages (default **200**, override with
  `MAX_MESSAGES_PER_CONVERSATION`), derived from the submitted history
- per IP per UTC day: max chat requests (default **300**, override with
  `MAX_MESSAGES_PER_IP_PER_DAY`) — the true, non-spoofable ceiling, shared by
  `/api/chat` and `/api/share`

Exceeding either returns HTTP 429 with a friendly message. The counters live in
the `ip_daily_usage` table (`migrations/0002_ip_daily_usage.sql`).

> A Cloudflare Turnstile bot challenge previously gated the first turn, but a
> Managed widget kept escalating to an interactive check the invisible flow
> couldn't complete, locking real readers out — so it was removed. The usage
> caps above are now the sole guard. If a stronger bot gate is needed later,
> add a Turnstile widget configured in **Invisible** mode (Managed mode is what
> caused the outage).

### Setup (one-time)

Apply the rate-limit migration to both remote databases:

```bash
npx wrangler d1 migrations apply philip-db --remote
npx wrangler d1 migrations apply philip-db-preview --remote --env preview
```

### Testing the 429 path on a preview deployment

To see the cap without sending hundreds of messages, temporarily set
`MAX_MESSAGES_PER_IP_PER_DAY=3` as a **Preview** environment variable and
redeploy.

## Regenerate bundled assets (optional)

These are committed, so you normally don't need to run them. To refresh:

```bash
npm run build:bible            # downloads WEB and writes public/bible/web/*.json
npm run build:bible:extra      # RV1909 (Spanish) + Luther 1545 (German)
npm run build:bible:originals  # Tischendorf Greek NT, WLC Hebrew, LXX, Vulgate
npm run gen:frontend           # regenerates public/frontend/bible-data.gen.js
npm run vendor:marked          # pins the markdown renderer into public/frontend/vendor
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
  the real bundled JSON, the OpenRouter tool loop (with canned SSE streams), the
  SSE handler, and the D1-backed usage caps and shared-snapshot persistence
  layer — all with mocked or in-memory dependencies, no network.
- **Frontend unit** (`test/unit/frontend/*.js`, jsdom): state reducer, markdown
  rendering + HTML sanitization, and the SSE client.
- **Integration** (`test/integration/*.ts`): real OpenRouter streaming, and the
  key guarantee that Philip quotes the **exact** bundled WEB text via the tool
  (no hallucinated scripture). Skipped unless `RUN_INTEGRATION=1` and a key are
  set.

## Local Database (D1)

Philip does **not** store conversation history server-side — conversations live
in the reader's browser. D1 (see the `[[d1_databases]]` binding in
`wrangler.toml`, exposed as `env.DB`) holds only two things: the per-IP/day rate
limit counters (`ip_daily_usage`) and the **explicit, opt-in share snapshots**
(`shared_conversations`, which expire). If `env.DB` is unavailable, chat still
works (rate limiting fails open) and only sharing is disabled.

### Local Development (`npm run dev`)

`wrangler pages dev` (and therefore `npm run dev`) uses a **local, persistent
SQLite file** instead of the remote D1 instance. Data survives restarts of the
dev server.

The file lives under:

```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
```

Query and inspect it with the Wrangler CLI (always use `--local`):

```bash
# List tables (including the ones from your migration)
npx wrangler d1 execute philip-db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table';"

# See recent share snapshots
npx wrangler d1 execute philip-db --local \
  --command "SELECT id, created_at, expires_at FROM shared_conversations ORDER BY created_at DESC LIMIT 5;"

# Inspect today's per-IP usage counters
npx wrangler d1 execute philip-db --local \
  --command "SELECT * FROM ip_daily_usage ORDER BY day DESC LIMIT 10;"

# Re-apply migrations to the local DB
npx wrangler d1 migrations apply philip-db --local
```

To start completely fresh locally, delete the persistence directory:

```bash
rm -rf .wrangler/state/v3/d1/
```

### Tests

Backend unit tests that exercise the database layer (`test/unit/db.test.ts`)
use a **fresh in-memory D1** (via Miniflare with `d1Persist: false`). Before
the tests run, all `migrations/*.sql` are applied in order, so the tests
validate against the real production schema (the `shared_conversations` and
`ip_daily_usage` tables), constraints, and result shapes.

- No files are written to disk.
- Each test file / suite gets its own isolated DB instance.
- The `createTestD1()` helper in `test/helpers.ts` handles setup and teardown.

All other backend unit tests either mock the DB or don't touch persistence.

### Remote vs. Local

- `--local` (or `npm run dev`) → your machine's SQLite file.
- No flag or `--remote` → the real Cloudflare D1 (requires `wrangler login` and the `database_id` from `wrangler.toml`).

Always prefer `--local` during development so you don't accidentally modify production data.

> **Note:** The local SQLite file used by `npm run dev` is **completely separate** from the in-memory D1 instances created by the unit tests. Running `npm test` never touches your `.wrangler/state` files.

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

Pushes to `main` (and manual runs via "Run workflow") automatically deploy to
**production** via `.github/workflows/deploy.yml`. Every **pull request** deploys a
**preview** (see below). The workflow runs typecheck + tests + integration tests (if
the key is available) before deploying.

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

### Preview deployments (pull requests)

Opening a PR deploys a Cloudflare Pages **preview** at
`https://<branch>.philip-3jf.pages.dev`, and the workflow posts (and keeps updating)
the URL as a PR comment. The deploy step picks the environment from the branch:
`main` → production, anything else → preview. PRs from forks skip the deploy/comment
steps (they can't read repo secrets) but still run typecheck + tests.

Two things make previews fully functional, separate from production:

- **Database** — previews use an isolated D1 database `philip-db-preview` (configured
  under `[env.preview]` in `wrangler.toml`) so PR testing never touches production
  conversations. Re-apply migrations to it with
  `npx wrangler d1 migrations apply philip-db-preview --remote --env preview`.
- **Secret** — Pages secrets are per-environment and the CLI can't target preview, so
  set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) once in the dashboard:
  **Workers & Pages → philip → Settings → Variables and Secrets → Preview**. Without
  it, the chat API returns 500 in previews (static pages still load).

> Note: `.github/workflows/ci.yml` also runs the test suite on PRs, so tests run twice
> on a PR (once in CI, once in the deploy workflow). Harmless; can be slimmed later.

Cloudflare Pages scales to zero — you only pay (nothing, on the free tier) when
someone is actually reading.

## Architecture notes

- `src/bible.ts`, `src/philip.ts`, `src/openrouter.ts`, `src/chat.ts` are
  transport-agnostic and dependency-injected (fetch + asset lookup are passed
  in). The Pages Function is a thin wrapper. A future **WhatsApp** webhook can
  reuse the same `src/` modules unchanged.
- Scripture is fetched per-book at request time from the bundled JSON via the
  `get_passage` tool, so the model never invents verse text.
