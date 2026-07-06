#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs npm dependencies so `npm test` / `npm run typecheck` work with no
# manual setup. Offline unit tests (backend + frontend) need nothing else:
# no network, no OpenRouter key, no Playwright browsers.
set -euo pipefail

# Only run in the remote (claude.ai/code) environment; a no-op locally.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Idempotent and cache-friendly: npm install is a ~2s no-op once node_modules
# is warm, and a full install (~12s) on a cold container.
npm install
