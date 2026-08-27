---
name: verify-workout-timer
description: Drive the Workout Timer PWA in a real Chromium with agent-browser — launch the dev server, walk a flow the way a user does, read IndexedDB, capture proof. Use before claiming any UI, timer, persistence, or PWA change works; a green `pnpm check` is not verification.
---

# Verify Workout Timer

A local-first Vue 3 PWA. No backend, no accounts — every claim about "it works"
is a claim about what a browser put in IndexedDB and what it showed afterwards.
The [test tiers](../../../docs/testing-strategy.md) grade whether the code is
right; this grades whether the app is. `docs/agent-browser.md` is the concept
behind this skill — it predates the timer and still uses the starter template's
notes example, so **the commands here are the current ones**.

The harness is `agent-browser` (v0.27.1 at time of writing), a CDP CLI installed
globally. Read `agent-browser skills get core --full` once per session before
the first command.

Everything below was executed against this repo. The gotchas are failures that
actually happened, not cautions.

## Launch

```bash
CI=1 pnpm dev       # background it; Vite serves http://localhost:5173
```

`CI=1` is not ceremony: it drops the Vue DevTools plugin
(`vite.config.ts` already gates it that way), whose floating panel sits over the
bottom navigation at phone widths and swallows taps on it.

Ready when `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/`
returns `200`. The dev server runs the service worker
(`devOptions.enabled` in `vite.config.ts`), so PWA behaviour is smoke-testable
here — but only the e2e tier (`pnpm test:e2e`, `vite preview` on :5678) proves
the *shipped* bundle offline.

```bash
agent-browser --session-name wt set device "iPhone 15"
agent-browser --session-name wt open http://localhost:5173/
agent-browser --session-name wt wait --text "Choose a format"
```

Mobile-first shell: drive it at a phone size or you are checking a layout no
user has. Pass `--session-name wt` on **every** command — it pins one browser
across the run.

**A browser restart resets everything.** `set device` and the whole profile —
`localStorage`, IndexedDB, the dismissed install banner — go with it, and the
next screenshot silently comes back at desktop width against an empty database.
Re-apply `set device` after any restart, and treat the first screenshot's
viewport as the check that it took.

**Isolation:** two `agent-browser` sessions pointed at `localhost:5173` share
`localStorage` and IndexedDB — verified, not assumed. `--session-name` gives you
a separate browser view, not separate storage (closing one session does leave
the other's data intact). If another agent is already driving :5173, either wait
or start a second server (`pnpm dev --port 5174`) and drive that origin instead.
Never double-drive one port: the other run's workout will finish under you.

## Doctor

One read-only check before trusting anything on screen:

```bash
.claude/skills/verify-workout-timer/scripts/doctor.sh wt
```

It reports the server's HTTP status, the browser's current URL, whether the
Vue app mounted, how many rows sit in each IndexedDB store, and any uncaught
page errors. Run it first whenever a click "worked" but nothing changed.

## Drive

### The four commands that matter

```bash
agent-browser --session-name wt snapshot -i          # a11y tree + @eN refs
agent-browser --session-name wt click @e9            # act on a ref
agent-browser --session-name wt find role button click --name "AMRAP"
agent-browser --session-name wt find label "Result notes" fill "…"
```

`snapshot -i` reads the app the way a screen reader does, so a control missing
its label shows up right there.

### Gotchas — each one cost a silent failure

**1. The PWA install banner overlays the run screen's buttons.** `Pause`,
`Add round` and `Finish workout` sit under it. The click reports `✓ Done` and
lands on the banner. Dismiss it once per profile, before driving a workout:

```bash
agent-browser --session-name wt find role button click --name "Not now"
```

When a run-screen tap does nothing, hit-test before suspecting the code:

```bash
agent-browser --session-name wt eval 'const b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Add round")); const r=b.getBoundingClientRect(); document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).outerHTML.slice(0,120)'
```

**2. `find role … --name` matches visible text only — never `aria-label`.**
`find role button click --name "Cancel workout"` fails with *Element not found*
even though `snapshot -i` lists that exact button. Every icon-only control in
this app is aria-label-only: the run screen's cancel and sound toggles, and all
four preset row actions (`Use …`, `Edit …`, `Duplicate …`, `Delete …`). Reach
them by ref, or by CSS:

```bash
agent-browser --session-name wt click '[aria-label="Cancel workout"]'
```

**3. Picker chips are in a horizontal scroller and start off-viewport.** The
duration/interval/rounds pickers auto-scroll the *selected* chip into view, so
`1 min` sits at x ≈ −4260 while `10 min` is centred. Clicking it reports
`✓ Done` and selects nothing — the workout then runs at the mode default.
Always scroll first, and always confirm the selection:

```bash
agent-browser --session-name wt snapshot -i -s fieldset      # chips only, not 400 buttons
agent-browser --session-name wt scrollintoview @e17
agent-browser --session-name wt click @e17
agent-browser --session-name wt eval '[...document.querySelectorAll("[aria-pressed=true]")].map(b=>b.textContent.trim())'
```

**4. `wait --text` matches *rendered* text.** The run screen's phase label is
CSS-uppercased, so `wait --text "Work"` times out and `wait --text "WORK"`
returns instantly. Take wording from `src/i18n/messages/en.ts`, then check what
the CSS did to it.

**5. `wait --url` is exact-match only.** Every glob form — `**/session/**`,
`http://localhost:5173/**` — times out; the full literal URL matches. Wait on
text and read the URL back with `get url` instead.

**6. Refs renumber on every snapshot, and routes are lazy.** `wait` for
something the *view* owns before the first snapshot, and re-snapshot after any
navigation, sheet, or write.

**7. `reload` keeps the current route.** Resetting the database from
`/timer/amrap` leaves you on `/timer/amrap`. `open` the URL you want first.

**8. `eval` has no top-level await.** Wrap async work in an
`(async () => { … })()` IIFE and use the `--stdin` heredoc for anything with
quotes.

**9. Two round taps inside 250 ms collapse into one** (`ROUND_DEBOUNCE_MS`,
`src/db/sessionTransitions.ts`) and a destructive tap disarms after 3 s
(`CONFIRMATION_WINDOW_MS`, `src/state/confirmation.ts`). Space round taps by a
second; land the second tap of a Finish/Cancel/Delete pair immediately. Two
back-to-back CLI commands take ~0.2 s each and fit; an `eval` or a snapshot
wedged between them does not.

**10. A short workout ends itself.** The run driver finishes a session at its
endpoint and navigates away. Taps aimed at a screen that has moved on still
report `✓ Done`. Read `status` and `finishReason` out of the `sessions` store
before believing a Finish or Cancel did anything.

### Reading IndexedDB

The UI showing a result is not proof of what landed on disk. The database is
`workout-timer`; its stores are `sessions`, `presets`, `timerSettings`.
The result-notes field on a session is `notes` — `workoutNotes` is the
description typed on the setup screen.

```bash
cat <<'EOF' | agent-browser --session-name wt eval --stdin
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('workout-timer')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const rows = await new Promise((res, rej) => {
    const r = db.transaction('sessions').objectStore('sessions').getAll()
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  return rows.map((s) => ({ status: s.status, rounds: s.rounds.length, notes: s.notes }))
})()
EOF
```

This is also how you check a migration: write a row in the old shape, reload,
read back what `src/db/converters.ts` decoded.

### Resetting between runs

State is the product, so it survives your walkthroughs too. Wipe and reload —
Dexie holds the connection open, so the delete fires `blocked` and only lands
once the reload drops it:

```bash
.claude/skills/verify-workout-timer/scripts/reset-db.sh wt
```

## Evidence

Everything goes in `test-results/verify/` — gitignored, and **not** touched by
cleanup.

```bash
agent-browser --session-name wt screenshot test-results/verify/01-result.png
agent-browser --session-name wt set media dark      # or light
agent-browser --session-name wt console             # what the app logged
agent-browser --session-name wt errors              # uncaught — never fine
```

Read screenshots back. They are the only check that catches a safe-area
misfire, an overlapping sheet, or text a theme made invisible. They are **not**
visual-tier baselines — `pnpm test:visual:update` owns those.

A proof of this app is complete when it has all four:

1. **The real user path.** Tap the chips, type in the fields, press Start. Not
   `eval` calling a setter, not a seeded IndexedDB row. `eval` is for *reading*
   and for hit-testing a click that lied.
2. **The action and the resulting state**, not just the final screen — the
   screenshot of `Workout complete` proves nothing about which duration ran.
3. **The side effect**, read out of IndexedDB, in the same run.
4. **A reload.** Local-first means the claim is "it survives", and every screen
   in this app re-reads from Dexie on mount. `console`/`errors` afterwards:
   `src/lib/persistentStorage.ts` fails quietly by design, so `console` is
   where those decisions are visible.

Nothing here is a regression test. It goes stale the moment the browser closes,
which is why anything it finds ends up in a tier — the walk tells you which.

## Cleanup

```bash
agent-browser --session-name wt close      # this session's browser, not --all
kill %1                                    # or: the pnpm dev job you started
```

Kill **what you started**, by job or PID. Never `pkill -f vite` — a stray dev
server serving stale code costs the next person an hour, and killing someone
else's costs them the same. Evidence in `test-results/verify/` stays.

## Helpers

Both ship with this skill and are executable:

| Script | Invocation | Does |
| --- | --- | --- |
| `scripts/doctor.sh` | `.claude/skills/verify-workout-timer/scripts/doctor.sh wt` | Read-only health: server, URL, mount, row counts, page errors |
| `scripts/reset-db.sh` | `.claude/skills/verify-workout-timer/scripts/reset-db.sh wt [url]` | Navigates to the app, deletes `workout-timer`, reloads, waits for the home screen |

The argument is the `--session-name`, defaulting to `wt`.

## Feature map

[`features/README.md`](features/README.md) indexes one file per user-facing
feature: how to reach it, how to drive it, and what end state proves it. It is
the maintained source of what "verified" covers — a proof that drives only the
convenient entry point is incomplete when the map lists others. Keep it honest
as the app changes (`/maintain-verification-skill`).
