# Run a workout

The load-bearing journey: pick a mode, configure it, start, work, finish, keep
the result. Everything else in the app exists to feed or read this.

## Sub-features

- **Mode choice** — AMRAP, For Time, EMOM, Tabata, each with its own setup form
  (`src/views/TimerSetupView.vue`). AMRAP takes a duration; For Time an optional
  cap and target rounds; EMOM an interval and rounds; Tabata work, rest, rounds.
- **Start countdown** — "Get ready" for `startCountdownMs` (default 3 s) before
  the first work phase. Pause and Add round are disabled during it.
- **Running** — a ring, a phase label, a clock. Pause/Resume, and Add round for
  the open-ended modes only (`capturesRoundSplits`: AMRAP and For Time).
- **Finish / Cancel** — both arm-then-confirm, both 3 s to land the second tap.
  Finish goes to the result screen; Cancel drops the session and returns home.
- **Resume** — a running session that outlives its screen surfaces as
  "Workout in progress" on the home screen and blocks starting another.
- **Result** — elapsed, rounds, and a notes field; saving lands on the history
  detail screen.

## How to get to it (user POV)

Open the app, tap a mode card, choose the numbers, tap **Start**. Or tap
**Resume timer** on the home screen if a workout is already running, or **Use
&lt;preset&gt;** from Presets to skip the numbers.

## Driving it with agent-browser

Dismiss the install banner first — it sits on top of the run screen's buttons.

```bash
.claude/skills/verify-workout-timer/scripts/reset-db.sh wt

agent-browser --session-name wt find role button click --name "AMRAP"
agent-browser --session-name wt wait --text "AMRAP setup"

# Chips start off-viewport. Scroll, click, then confirm the selection took.
agent-browser --session-name wt snapshot -i -s fieldset | head -6
agent-browser --session-name wt scrollintoview @e17     # the "1 min" chip
agent-browser --session-name wt click @e17
agent-browser --session-name wt eval '[...document.querySelectorAll("[aria-pressed=true]")].map(b=>b.textContent.trim())'

agent-browser --session-name wt find label "Workout description" fill "5 pull-ups, 10 push-ups, 15 squats"
agent-browser --session-name wt find role button click --name "Start" --exact
agent-browser --session-name wt wait --text "WORK"      # rendered text: CSS uppercases it

agent-browser --session-name wt find role button click --name "Not now"   # install banner, if shown
agent-browser --session-name wt find role button click --name "Add round"
```

**Choose the duration for the ending you want to verify.** A 1 min AMRAP
finishes itself while you are still typing: the run driver ends it at the
endpoint and navigates to the result screen, and every Finish tap after that
reports `✓ Done` against a session that is already `completed`. To drive the
*manual* ending, pick a chip you will not outlive — the 10 min default is fine
— and land both taps within the 3 s window:

```bash
agent-browser --session-name wt find role button click --name "Finish workout"
agent-browser --session-name wt find role button click --name "Tap again to finish"
```

Either way you land on the result screen:

```bash
agent-browser --session-name wt find label "Result notes" fill "Felt strong, unbroken sets"
agent-browser --session-name wt find role button click --name "Save result"
```

Cancel instead of finishing (aria-label, so CSS not `find role`):

```bash
agent-browser --session-name wt click '[aria-label="Cancel workout"]'
agent-browser --session-name wt click '[aria-label="Tap again to cancel"]'
```

## What proves it

The URL walks `/` → `/timer/amrap` → `/session/:id` → `/session/:id/result` →
`/history/:id`, and the session row says so:

```bash
agent-browser --session-name wt reload
agent-browser --session-name wt wait --text "Felt strong, unbroken sets"
```

```json
[{ "status": "completed", "finishReason": "endpoint", "rounds": 1,
   "notes": "Felt strong, unbroken sets",
   "workoutNotes": "5 pull-ups, 10 push-ups, 15 squats",
   "config": { "mode": "amrap", "durationMs": 60000 } }]
```

`config.durationMs` is the assertion that the chip tap landed — a screenshot of
"Workout complete" says nothing about which duration ran. `notes` is the result
notes; `workoutNotes` is the setup description. `finishReason` says *which*
ending you actually proved: `endpoint` (the clock ran out), `manual` (the
Finish pair), or `cancelled`.

## Gotchas

- The install banner overlays Pause / Add round / Finish. Clicks report
  `✓ Done` and hit the banner. Dismiss it, then hit-test if a tap does nothing.
- A chip click on an off-viewport chip silently no-ops and the mode default
  runs instead. `scrollintoview` first; verify with `aria-pressed`.
- Two Add round taps inside 250 ms are one round (`ROUND_DEBOUNCE_MS`).
- Finish/Cancel disarm after 3 s (`CONFIRMATION_WINDOW_MS`). Two CLI commands
  land comfortably inside that (~0.2 s each), but an `eval` or a snapshot
  between them will not.
- A workout whose clock ran out is already `completed` on disk. Finish taps
  after that hit a screen that has moved on and report `✓ Done` regardless —
  check `status` before believing a Finish did anything.
- The install banner is dismissed per browser profile. "Not now" being *not
  found* means it was already dismissed, not that the click failed.
- Start is disabled while another session is running — reset or cancel first.
- The result screen's "already saved" is literal: the session is `completed` on
  disk before you type a note. Saving notes only patches `notes`.
