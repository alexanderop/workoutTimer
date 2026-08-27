# History

Every finished workout, kept on the device.

## Sub-features

- **List** — `/history`, newest first, each row naming mode, date, elapsed and
  rounds.
- **Filters** — `All` / `Completed` / `Cancelled`.
- **Detail** — `/history/:id`: elapsed, rounds, configuration, workout
  description, result notes, round splits.
- **Delete** — arm-then-confirm on the detail screen.

## How to get to it (user POV)

**History** in the bottom nav, then a row. Saving result notes at the end of a
workout also lands here.

## Driving it with agent-browser

```bash
agent-browser --session-name wt find role button click --name "History"
agent-browser --session-name wt wait --text "Workout history"
agent-browser --session-name wt snapshot -i
# rows carry their whole summary as the accessible name:
#   button "AMRAP Aug 26, 2026, 11:44 PM 00:39 · 1 Rounds"
agent-browser --session-name wt find role button click --name "Completed"
```

Row and delete controls are best reached by ref from a fresh `snapshot -i`;
the filters (`All`, `Completed`, `Cancelled`) have visible text and work with
`find role`.

## What proves it

The list renders the row after a reload, and the `sessions` store agrees on
`status`, `finishReason` and `rounds.length`. A cancelled workout must show
under **Cancelled** and not under **Completed** — the split comes from
`FINISHED_STATUSES`, filtered out of `SESSION_STATUSES`, not from a literal.

## Gotchas

- The empty state is "Completed workouts will appear here." — a leftover row
  from a previous walkthrough makes the next run lie. Reset first.
- Dates render in the browser's locale and timezone; do not match on them.
- Delete disarms after 3 s.
