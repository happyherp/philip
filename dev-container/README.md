# Dev container (Node + Grok)

A ready-to-use development container for Philip. It ships Node 22, **Playwright browsers**
(Chromium, Firefox, WebKit), the project tooling (wrangler, vitest), and the **Grok
coding-agent CLI** (`grok-build`) preinstalled and authenticated with your account.

The project directory is bind-mounted into the container, so you **edit and test inside
the container but commit from the host** — the container has **no git credentials**.

## Files

| File | Purpose |
| --- | --- |
| [`Dockerfile`](Dockerfile) | `mcr.microsoft.com/playwright:v1.60.0-noble` (Node 22 + Playwright browsers) + `git`/`curl`/`ripgrep`/`jq`, a `dev` user matching your host UID/GID, and Grok installed via the official script (pinned to `GROK_VERSION`). The base-image tag **must** match the `@playwright/test` version in `package.json`. |
| [`docker-compose.yml`](docker-compose.yml) | Bind-mounts the repo + your Grok login, forwards port `8788`, runs interactively. |
| [`docker-entrypoint.sh`](docker-entrypoint.sh) | Runs `npm ci` only if `node_modules` is missing (normally it's bind-mounted in). |
| [`.dockerignore`](.dockerignore) | Keeps the (already tiny) build context clean. |

## How it works

- **Grok auth:** your `~/.grok/auth.json` is mounted **read-write** (so OAuth token
  refresh persists back to the host) and `~/.grok/config.toml` is mounted in. `grok-build`
  is subscription-gated, and that entitlement rides on this login — an `XAI_API_KEY`
  alone would not grant it.
- **Dependencies:** `node_modules` and `.dev.vars` come from the repo via the bind mount
  (already installed); the entrypoint runs `npm ci` only as a fallback.
- **File ownership:** the container runs as your host UID/GID (from `.env`, default
  `1000`), so files Grok creates in the workspace stay owned by you.
- **Git identity:** your `user.name`/`user.email` (from `.env`) are applied via
  `git config --global` at startup, so the agent's *local* commits are attributed to you.
- **No push access:** no git *credentials* are mounted — commit/push from the host.

## Quick start

One command does everything — generate your per-machine `.env`, build the image, and drop
into a Grok session (re-runnable; any args pass through to `grok`):

```bash
./dev-container/start.sh       # from the repo root
```

Or run the steps yourself from this directory (`dev-container/`):

```bash
docker compose build           # one-time (downloads grok + apt deps)
docker compose run --rm dev grok   # start a Grok session
docker compose run --rm dev bash   # or drop into a shell
```

## Common commands

```bash
# Tests / typecheck:
docker compose run --rm dev npm test
docker compose run --rm dev npm run test:e2e        # Playwright E2E (Chromium)
docker compose run --rm dev npm run typecheck

# One-shot (headless) Grok prompt — also the real auth check:
docker compose run --rm dev grok -p "Reply with one word: pong" -m grok-build

# Dev server, reachable from the host browser (note --ip 0.0.0.0):
docker compose run --rm --service-ports dev \
  npx wrangler pages dev public --ip 0.0.0.0 --port 8788
#   -> http://localhost:8788
```

> `wrangler pages dev` binds to localhost *inside* the container; `--ip 0.0.0.0` is what
> makes it reachable through the forwarded port.

## Per-machine settings: `.env` (portability)

`dev-container/.env` (gitignored, machine-specific) holds your **host UID/GID** and your
**git identity**:

- **UID/GID** build a matching `dev` user so files created in the bind-mounted workspace
  stay owned by you. This is a **Linux-native** concern — macOS/Windows Docker Desktop
  remap ownership automatically. Defaults to `1000:1000` if `.env` is absent.
- **GIT_USER_NAME / GIT_USER_EMAIL** are applied via `git config --global` at startup so
  the agent's local commits are attributed to you (identity only — no push credentials).

On a new machine, generate yours once (from this directory):

```bash
{ printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)"
  printf 'GIT_USER_NAME=%s\n' "$(git config --get user.name)"
  printf 'GIT_USER_EMAIL=%s\n' "$(git config --get user.email)"; } > .env
docker compose build
```

## Customizing

Override build args in [`docker-compose.yml`](docker-compose.yml) under `build.args`:

- `GROK_VERSION` — pin a different Grok release (default `0.2.22`).

When bumping `@playwright/test` in `package.json`, update the `FROM` tag in the
[`Dockerfile`](Dockerfile) to match (e.g. `v1.61.0-noble` for `@playwright/test@1.61.0`).

Optional mount (commented in the compose file):

- `~/.grok/skills` — bring your Grok skills/plugins for full parity with the host.

## Notes

- **`grok models` may print "You are not authenticated."** That's a quirk of that
  lightweight command (it ignores the cached token) — it does **not** mean Grok is
  unauthenticated. The real check is the headless `grok -p "…"` above; it behaves the
  same on the host.
- A harmless `ERROR … missing field 'index'` may appear while Grok parses `grok-build`'s
  thinking stream — output is still correct. It's a parser warning in Grok `0.2.22`, not
  a container issue.
