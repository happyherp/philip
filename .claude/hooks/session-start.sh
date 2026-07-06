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

# Playwright e2e (`npm run test:e2e`): the web environment ships a pre-installed
# Chromium whose build may not match the one @playwright/test would download, so
# it refuses to launch by default. Point the tests at the pre-installed binary
# instead of downloading — playwright.config.ts honours PW_CHROMIUM_PATH.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  chrome_bin="$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$chrome_bin" ] && [ -x "$chrome_bin" ]; then
    echo "export PW_CHROMIUM_PATH=\"$chrome_bin\"" >> "$CLAUDE_ENV_FILE"
  fi
fi
