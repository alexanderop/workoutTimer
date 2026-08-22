---
type: Playbook
title: Cloud environment setup
description: What a Claude Code cloud session needs before it can run anything, and the setup script that installs it once per container instead of once per session by hand.
tags: [tooling, cloud, agent-browser, playwright, environment]
status: stable
---

# Cloud environment setup

A [Claude Code cloud](https://code.claude.com/docs/en/claude-code-on-the-web)
session runs in a fresh container: the repository is cloned, but `node_modules`
is empty and nothing is installed globally. Without setup, the first minutes of
every session are spent installing — and `agent-browser`, the CLI the
[browser walkthrough](agent-browser.md) depends on, cannot install itself at
all under a restricted network policy.

`scripts/cloud-setup.sh` is that setup, versioned here rather than pasted into
a settings form. The environment's **Setup script** box gets a bootstrap that
runs it:

```bash
#!/bin/bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
bash scripts/cloud-setup.sh
```

That is the whole environment configuration, and it never needs editing again:
what a session installs is decided by the script in this repository, on the
branch the session checks out.

Leave **Environment variables** empty — the image already sets everything the
repository reads, and the field is visible to anyone using the environment, so
nothing secret belongs in it. `VITE_OTLP_URL` (see `.env.example`) is dev
telemetry and is not needed for a session to work.

## What it does

| Step | Why it is not optional |
| --- | --- |
| `pnpm install --frozen-lockfile` | Nothing in the repo runs without it, and the frozen lockfile keeps a session on CI's tree |
| `npm install -g agent-browser` | The CLI is global by design and holds no dependency here, so it dies with the container |
| Symlink Chromium | Reuses the image's Playwright build rather than downloading a second browser |
| Run `.claude/hooks/references.mjs` | Starts the [reference](index.md#references) clones before the agent launches instead of after |

Only the dependency install is fatal. Every other step warns and continues: a
missing browser costs you a verification tool, not the session.

## Why the Chromium symlink

`agent-browser install` downloads Chrome for Testing from
`googlechromelabs.github.io`, which a restricted network policy blocks — the
failure is a tunnel error, and there is nothing to retry. The image already
ships the Chromium that Playwright pins, at `PLAYWRIGHT_BROWSERS_PATH`, and
`agent-browser` looks there. The two disagree on one directory name:
Chrome for Testing is laid out as `chrome-linux64/chrome`, Playwright's build
as `chrome-linux/chrome`. A symlink per build bridges them, and both tools then
drive the same binary.

The alias is made inside the browsers directory when that is writable and under
`~/.cache/ms-playwright` when it is not; `agent-browser` reads both.

## What it deliberately leaves out

Warming a build or type-check cache would move the cost into setup rather than
remove it — session start waits for this script. The
[browser test tiers](testing-strategy.md) need no extra install: they run
against the same preinstalled Chromium through Playwright, which reads
`PLAYWRIGHT_BROWSERS_PATH` directly and never needed the alias.

The script is idempotent and takes no arguments, so running it by hand is the
way to repair a container that started before it existed.
