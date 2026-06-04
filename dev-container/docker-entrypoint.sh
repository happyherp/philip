#!/usr/bin/env bash
set -e

# node_modules is normally bind-mounted in from the host (already installed). Only run
# npm ci when it's genuinely missing (e.g. a fresh copy without deps).
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "[entrypoint] node_modules missing — running npm ci..."
  npm ci
fi

# Inherit the host's git identity for local commits (no push credentials are provided —
# pushing is done from the host). Written to the container's ~/.gitconfig, not the repo.
if [ -n "${GIT_USER_NAME:-}" ]; then
  git config --global user.name "$GIT_USER_NAME"
fi
if [ -n "${GIT_USER_EMAIL:-}" ]; then
  git config --global user.email "$GIT_USER_EMAIL"
fi

exec "$@"
