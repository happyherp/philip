#!/usr/bin/env bash
set -e

# node_modules is normally bind-mounted in from the host (already installed). Only run
# npm ci when it's genuinely missing (e.g. a fresh copy without deps).
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "[entrypoint] node_modules missing — running npm ci..."
  npm ci
fi

exec "$@"
