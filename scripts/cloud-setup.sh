#!/usr/bin/env bash
# Setup script for a Claude Code cloud environment.
#
# Paste the three-line bootstrap from docs/cloud-environment.md into the
# environment's "Setup script" box; it runs this file, so what a session needs
# is versioned with the repository instead of pasted into a settings form.
#
# It runs once per session, before the agent launches, in a fresh container
# where node_modules is empty and nothing global is installed. Everything here
# is idempotent and safe to run by hand.
#
# Only the dependency install is fatal — nothing else may cost you a session.

set -euo pipefail

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }

# The setup script's cwd is not guaranteed, so find the checkout from this
# file's own location and work from there.
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step "Installing dependencies (pnpm)"
# --frozen-lockfile so a session never silently drifts from CI's tree. This is
# the one step worth failing on: without it nothing else in the repo runs.
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile --prefer-offline

step "Installing agent-browser"
# The CLI an agent verifies a feature with — docs/agent-browser.md. Global, no
# dependency in this repo, so it has to be installed per container.
npm install -g "agent-browser@${AGENT_BROWSER_VERSION:-latest}" >/dev/null ||
  warn "agent-browser install failed — browser verification unavailable"

step "Pointing agent-browser at the preinstalled Chromium"
# The image ships Playwright's Chromium and sets PLAYWRIGHT_BROWSERS_PATH, and
# `agent-browser install` downloads its own Chrome from googlechromelabs.github.io
# — a host the network policy blocks unless it was allowlisted. So reuse the
# browser that is already on disk.
#
# agent-browser reads PLAYWRIGHT_BROWSERS_PATH and ~/.cache/ms-playwright, but
# expects Chrome-for-Testing's `chrome-linux64/chrome`, while Playwright lays
# its build out as `chrome-linux/chrome`. One symlink per build bridges the two.
link_chromium() {
  local browsers="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" build name linked=0
  [ -d "$browsers" ] || return 1

  for build in "$browsers"/chromium-*/; do
    [ -x "${build}chrome-linux/chrome" ] || continue
    name="$(basename "$build")"

    # Alias in place when the image is writable, otherwise in $HOME, which
    # always is. agent-browser finds either.
    if ln -sfn "${build}chrome-linux" "${build}chrome-linux64" 2>/dev/null ||
      { mkdir -p "$HOME/.cache/ms-playwright/$name" &&
        ln -sfn "${build}chrome-linux" "$HOME/.cache/ms-playwright/$name/chrome-linux64"; }; then
      linked=1
    fi
  done

  [ "$linked" = 1 ]
}
link_chromium || warn "no Playwright Chromium found — run 'agent-browser install' by hand"

step "Prefetching reference source trees"
# .claude/references.json checkouts (effect, reka-ui, …) that the SessionStart
# hook otherwise starts cloning only once the agent is already running, leaving
# the first minutes of a session with trees it is told about but cannot read.
# Running the hook's own script here starts the same detached clones earlier;
# by the time the hook runs again it finds them and only fetches.
node .claude/hooks/references.mjs </dev/null >/dev/null 2>&1 ||
  warn "reference prefetch failed — the SessionStart hook will still clone them"

step "Ready"
