#!/usr/bin/env bash
#
# One-shot dev-container launcher: generate the per-machine .env (host UID/GID + git
# identity), build the image, and drop into a Grok session in the project.
#
# Safe to re-run. Any arguments are forwarded to `grok` (e.g. `./start.sh -c` to continue
# the most recent session).
set -euo pipefail

# Operate from this script's directory (dev-container/) so `docker compose` finds the
# compose file and the relative bind mounts resolve correctly.
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi

# 1. Per-machine settings (created once; delete .env to regenerate from current host).
if [ ! -f .env ]; then
  echo "==> Creating .env (host UID/GID + git identity)…"
  {
    printf 'UID=%s\nGID=%s\n'   "$(id -u)" "$(id -g)"
    printf 'GIT_USER_NAME=%s\n'  "$(git config --get user.name  || true)"
    printf 'GIT_USER_EMAIL=%s\n' "$(git config --get user.email || true)"
  } > .env
fi

# 2. Build the image (a no-op when nothing has changed).
echo "==> Building image…"
docker compose build

# 3. Jump into Grok (any script args are passed through).
echo "==> Starting Grok…"
exec docker compose run --rm dev grok "$@"
