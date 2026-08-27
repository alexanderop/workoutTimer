# Settings

Preferences, and the only door your data has.

## Sub-features

- **Appearance** — dark mode switch.
- **Timer experience** — sounds, sound volume, haptics, spoken countdown, keep
  screen awake, start countdown (`Off` / 3 / 5 / 10 seconds).
- **Language** — English / Deutsch, driving `<html lang>` and every string.
- **Your data** — export a backup, import one (import replaces everything).

## How to get to it (user POV)

**Settings** in the bottom nav.

## Driving it with agent-browser

```bash
agent-browser --session-name wt open http://localhost:5173/settings
agent-browser --session-name wt wait --text "Your data"
agent-browser --session-name wt snapshot -i
agent-browser --session-name wt click @e9                    # "Dark mode" switch
agent-browser --session-name wt select @e21 "0"              # start countdown "Off"
agent-browser --session-name wt select @e22 "de"             # language
```

Switches report as `switch "…" [checked=…]` and the two `<select>`s as
`combobox` with their options listed — take the option values from the
snapshot's `--json` form or from `src/i18n/messages/en.ts` rather than guessing.

Export writes a file; drive it with `download` rather than `click`:

```bash
agent-browser --session-name wt download 'text=Export data' test-results/verify/backup.json
```

## What proves it

- **Dark mode**: the `dark` class on `<html>`, plus a screenshot in each theme
  (`agent-browser set media dark|light`). The screenshot is the only thing that
  catches text a theme made invisible.
- **Language**: `<html lang>` flips to `de` and the nav reads German.
- **Start countdown = Off**: the next workout goes straight to `WORK` with no
  "Get ready" — this is the setting reaching the run screen, which is the part
  a unit test cannot see.
- **Export/import**: export, wipe the database, import the file, and the
  sessions and presets come back. That is the whole local-first promise; the
  file is also what `src/lib/backupFile.ts` validates, so a malformed one must
  surface "That file is not a backup from this app" rather than an uncaught
  error.

## Gotchas

- Import replaces everything. Never run it against a database you still want.
- Sound, haptics and wake lock depend on browser support; headless Chromium
  will not prove they fired. The setting persisting is what is verifiable here.
- `timerSettings` is at schema v2 (`soundVolume`). A change to that row needs a
  version bump *and* a read path that still accepts the old shape.
