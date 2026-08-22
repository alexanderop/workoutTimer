---
type: Playbook
title: Driving the app with agent-browser
description: How an agent verifies a feature end to end in a real browser before claiming it works, and what the test tiers cannot tell it.
tags: [testing, browser-automation, agent-browser, verification, pwa]
status: stable
---

# Driving the app with agent-browser

`agent-browser` is a CLI that drives a real Chromium over CDP. It needs no
dependency in this repo, and it is how an agent **sees the feature it just
built**. The rule it exists for:

> A change is not verified because `pnpm check` passed. It is verified when the
> flow has been walked in a browser — clicked, typed, saved, reloaded — and the
> data was still there.

The [test tiers](testing-strategy.md) grade whether the code is right. This
grades whether the app _is_ right: the sheet actually opens, the keyboard inset
does not eat the Start button, the workout survives a reload. Those are the things a
green suite has been known to lie about, and they are the whole product in a
[local-first](local-first.md) PWA.

Read the CLI's own guide before the first command in a session —
`agent-browser skills get core --full`. It ships with the binary, so it is
always version-matched, and it covers the parts this document does not repeat
(auth vaults, network routing, tracing, tabs, iOS simulator).

## Getting the binary

On a local machine it is already on `PATH`. A fresh container — a Claude Code
web/remote session, CI, a new devbox — starts without it, and installing it is
two commands:

```bash
pnpm install                      # the repo's own deps, for the dev server
npm i -g agent-browser            # ~3s, one package, no browser download
```

It warns `EBADENGINE` on Node 22 (it asks for 24) and works anyway. It also
finds a Chromium on its own; on a Claude Code remote session the pre-installed
one under `/opt/pw-browsers` is already there, so nothing needs downloading —
never run `playwright install`.

Then start the dev server detached and drive it over loopback:

```bash
nohup pnpm dev --host 127.0.0.1 --port 5173 --strictPort > /tmp/dev.log 2>&1 &
```

Two container-specific traps:

- **Screenshot paths are resolved by the browser process, not your shell.** A
  relative `screenshot foo.png` lands in the repo root and gets committed by
  accident. Always pass an absolute path outside the repo.
- **`curl` to `127.0.0.1` needs `--noproxy 127.0.0.1`** when `HTTPS_PROXY` is
  set, or the health check goes to the proxy instead of Vite.

## When to reach for it

| Reach for it                                                             | Instead of                        |
| ------------------------------------------------------------------------ | --------------------------------- |
| Finishing a feature — walk the new flow before saying it works           | Claiming done off `pnpm check`    |
| A layout, safe-area, or keyboard bug that only shows on a phone viewport | Guessing from the CSS             |
| "Does this persist?"                                                     | Reading the repository code again |
| Reproducing a bug report                                                 | Writing the fix first             |

It is not a test tier. Nothing it does is committed, nothing it does runs in
CI. When a walkthrough finds a real bug, the fix ships with a test in the tier
that owns it — the browser walk is what told you which tier that is.

## The loop

```bash
pnpm dev                                        # in a background shell, :5173

agent-browser --session-name vps set device "iPhone 15"
agent-browser --session-name vps open http://localhost:5173
agent-browser --session-name vps wait --text "Workout Timer"  # ← see below, this matters
agent-browser --session-name vps snapshot -i
agent-browser --session-name vps click @e4
```

`snapshot -i` prints the accessibility tree of the interactive elements with
`@eN` refs — a few hundred tokens instead of a DOM dump, and it reads the app
the way a screen reader does, so a control missing its label is visible right
there:

```text
- heading "Workout Timer" [level=1, ref=e5]
- region "Workout Timer" [ref=e6]
  - button "AMRAP As many rounds as possible" [ref=e11]
  - button "Tabata Alternate focused work and rest" [ref=e14]
- navigation "Main navigation" [ref=e1]
  - button "Timer" [ref=e2]
  - button "History" [ref=e3]
  - button "Settings" [ref=e4]
```

`--session-name` keeps one browser across commands and is worth passing every
time: without it, parallel work in another session shares the same default
browser.

### Refs go stale, and this app hydrates late

Every snapshot renumbers the refs, so a ref taken before the page changed points
at nothing you meant. In this app that bites at the very first command, because
the routes are lazy (`() => import('@/views/TimerHomeView.vue')`): open the page
and snapshot immediately, and you get the shell's bottom nav with no view under
it.
The refs shift the moment the view mounts, and the next click lands somewhere
else and reports `✓ Done` while doing nothing.

**Wait for something the view owns before the first snapshot**, and re-snapshot
after anything that changes the page — a route change, a sheet opening, a write
landing. When a ref click silently does nothing, a stale ref is the first
suspect, not the code.

`find` sidesteps refs entirely and is the more durable form for controls you can
name — it resolves at click time:

```bash
agent-browser --session-name vps find role button click --name "Tabata Alternate focused work and rest"
agent-browser --session-name vps find label "Preset name" fill "Morning burner"
```

Note the accessible name of a mode card is its title _and_ its description
joined — `snapshot -i` shows you the whole string, and that is what `--name`
has to match.

### Wait for the thing, not for a duration

`wait --text` and `wait @ref` need the string to actually exist. `wait --text
"Finish"` sits there for the full timeout on the run screen because the button
reads "Finish workout". Take the wording from `src/i18n/messages/en.ts` rather
than from memory, or wait for a ref.

### The setup screen has hundreds of buttons

`snapshot -i` on a setup screen prints every work/rest/round chip — 500+ refs,
which is a lot of tokens for nothing. Screenshot that screen instead, and reach
for `find` on the one control you actually want.

## Walking a workout end to end

The canonical check for this codebase — configure, run, finish, persist,
survive a reload — verified against the dev server:

```bash
agent-browser --session-name vps find role button click --name "Not now"   # dismiss the install prompt
agent-browser --session-name vps find role button click --name "Tabata Alternate focused work and rest"
agent-browser --session-name vps find role button click --name "Start"
agent-browser --session-name vps wait --text "Round 1 of 8"

# Finish is a double-tap: the second click has to land inside a 3s window
agent-browser --session-name vps find role button click --name "Finish workout"
agent-browser --session-name vps find role button click --name "Tap again to finish"
agent-browser --session-name vps find role button click --name "Save result"

agent-browser --session-name vps reload
agent-browser --session-name vps wait --text "Tabata"   # ← the local-first claim
```

Two things bite here and neither is a bug:

- **The PWA install prompt covers the first tap.** It mounts a moment after the
  home view, so the first `find … click` can resolve against the page behind
  it. Dismiss it with "Not now" first, then snapshot to confirm where you are.
- **Destructive actions arm before they fire.** `src/state/confirmation.ts`
  gives a 3-second window, so Finish, Cancel and Delete each need a second
  click on the _confirm_ label ("Tap again to finish"). Run the two clicks in
  one shell command — putting a `snapshot` between them spends the window and
  the button silently disarms.

### Reading IndexedDB directly

The UI showing a workout is not proof of what landed on disk. The database is
`workout-timer`, and its stores are `sessions`, `presets` and `timerSettings`:

```bash
cat <<'EOF' | agent-browser --session-name vps eval --stdin
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('workout-timer')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const rows = await new Promise((resolve, reject) => {
    const req = db.transaction('sessions').objectStore('sessions').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return rows.map((s) => ({ id: s.id, status: s.status, rounds: s.rounds }))
})()
EOF
```

```json
[{ "id": "2463661c-…", "rounds": [], "status": "completed" }]
```

`await indexedDB.databases()` is the cheap way to confirm the names before
guessing at a store — a wrong one throws `NotFoundError` from `transaction`.

Two mechanics that cost a round trip each if you learn them the hard way:
`eval` runs a plain script body, so top-level `await` is a syntax error — wrap
async work in an `(async () => { … })()` IIFE, whose promise the CLI awaits. And
use the `--stdin` heredoc for anything with quotes; inline `eval "…"` only
survives simple expressions.

This is also how you check a migration: write a row in the old shape, reload,
and read back what the converter produced.

### Resetting between runs

State is the point of this app, so it persists across your walkthroughs too — a
session left over from the last run will sit at the top of History, and a
half-finished one will greet you with "Workout in progress" and make the next
walk lie. Wipe the database and reload:

```bash
cat <<'EOF' | agent-browser --session-name vps eval --stdin
(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('workout-timer')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  return 'deleted'
})()
EOF
agent-browser --session-name vps reload
agent-browser --session-name vps wait --text "Completed workouts will appear here."
```

Dexie holds the connection open, so the delete fires `blocked` and only
completes once the reload drops it. The reload is part of the recipe, not a
nicety — and the empty state is how you know it worked.

## Looking at it

This shell is mobile-first, so drive it at a phone size or you are checking a
layout no user has:

```bash
agent-browser --session-name vps set device "iPhone 15"
agent-browser --session-name vps set media dark             # or light
agent-browser --session-name vps screenshot /tmp/timer-dark.png  # --full for scroll height
```

Read the screenshot back. It is the only check that catches a safe-area
misfire, an overlapping sheet, or text the theme made invisible — none of which
show up in a snapshot tree or a passing spec.

Screenshots taken this way are **not** visual-tier baselines. The
[visual tier](testing-strategy.md) owns those, its baselines are
platform-specific, and `pnpm test:visual:update` is the only thing that writes
them. Save yours somewhere temporary.

## Errors the app swallowed

```bash
agent-browser --session-name vps console      # console log, --clear to reset
agent-browser --session-name vps errors       # uncaught page errors
```

Worth a look after any walkthrough. Plenty of what this codebase does
deliberately fails quietly — `src/lib/persistentStorage.ts` logs a `console.debug`
and moves on, by design (see the Effect boundary rule in the [knowledge index](index.md)) — so
`console` is where those decisions become visible. An uncaught error in
`errors` is never fine.

## What the dev server cannot tell you

`pnpm dev` runs the service worker (`devOptions.enabled` in `vite.config.ts`),
which makes offline _look_ verifiable:

```bash
agent-browser --session-name vps set offline on
agent-browser --session-name vps reload
```

Treat that as a smoke check only. The dev SW precaches a different asset graph
than the built one, so it proves the app tolerates a dead network — not that the
shipped bundle does. The real answer is the e2e tier, which runs against
`vite preview` and asserts the worker actually served the reload
(`test/e2e/features/workout.feature`). If you want to drive the production build by
hand, point the CLI at `pnpm build && pnpm preview` instead of the dev server.

Two more things it will not tell you: it is not an accessibility audit —
`pnpm test:a11y` runs axe, the snapshot tree only shows you what a control is
named — and a single walkthrough is not a regression test. It goes stale the
moment you close the browser, which is why anything it finds ends up in a tier.

## Cleaning up

```bash
agent-browser close --all
```

Leave the browser running across a session's commands; close it when you are
done. Kill the dev server too — a stray `vite` on :5173 will serve stale code to
the next run and cost someone an hour.
