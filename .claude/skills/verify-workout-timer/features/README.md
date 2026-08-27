# Feature map — Workout Timer

One file per user-facing feature: what it is, how a user reaches it, how to
drive it with `agent-browser`, and what observable end state proves it works.
This is the maintained answer to "what does verified cover" — a proof that
walks only the convenient entry point is incomplete when the map lists others.

Read [../SKILL.md](../SKILL.md) first: launch, doctor, the gotchas, and the
proof standard live there.

| Feature | Route | What it owns |
| --- | --- | --- |
| [Run a workout](run-a-workout.md) | `/` → `/timer/:mode` → `/session/:id` → `/session/:id/result` | The product. Four modes, countdown, pause, round splits, finish/cancel, result notes |
| [Presets](presets.md) | `/timer/:mode`, `/presets` | Saving a setup, reusing it, editing, duplicating, deleting |
| [History](history.md) | `/history`, `/history/:id` | The completed/cancelled list, filters, the detail screen, deleting a workout |
| [Settings](settings.md) | `/settings` | Theme, language, timer feedback, start countdown, export/import |
| [PWA shell](pwa-shell.md) | any | Install prompt, service worker, offline, update prompt, safe areas |

Modes are `amrap`, `forTime`, `emom`, `tabata` (`src/features/timer/domain.ts`
— `TIMER_MODES` is read off `DEFAULT_CONFIGS`, so a fifth mode appears here
without anyone editing a list). All copy comes from
`src/i18n/messages/en.ts`; `de.ts` is the second locale.
