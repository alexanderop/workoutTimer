# Presets

A saved setup, so the numbers are typed once. Presets feed the home screen's
"Recent presets" and the Presets screen.

## Sub-features

- **Save** — a name field on any setup screen; the button reads *Save as
  preset*, or *Update preset* when the screen was opened from one.
- **Use** — starts the setup screen pre-seeded (`/timer/:mode?preset=<id>`).
- **Edit / Duplicate / Delete** — row actions on `/presets`; delete is
  arm-then-confirm.
- **Recent** — the home screen lists the most recently used ones.

## How to get to it (user POV)

Configure a mode, type a name under **Preset name**, tap **Save as preset**.
Later: **View all presets** on the home screen, or the preset row itself.

## Driving it with agent-browser

```bash
agent-browser --session-name wt find label "Preset name" fill "Cindy 1 min"
agent-browser --session-name wt find role button click --name "Save as preset"
```

Every row action on `/presets` is aria-label-only — `find role … --name` will
not see them. Use the label text the app builds (`presets.use` etc. in
`src/i18n/messages/en.ts`):

```bash
agent-browser --session-name wt open http://localhost:5173/presets
agent-browser --session-name wt wait --text "Presets"
agent-browser --session-name wt click '[aria-label="Use Cindy 1 min"]'
agent-browser --session-name wt click '[aria-label="Duplicate Cindy 1 min"]'
agent-browser --session-name wt click '[aria-label="Delete Cindy 1 min"]'
agent-browser --session-name wt click '[aria-label="Tap again to delete Cindy 1 min"]'
```

## What proves it

The `presets` store holds the row, with the config the chips produced:

```json
[{ "name": "Cindy 1 min", "config": { "mode": "amrap", "durationMs": 60000 } }]
```

For **Use**, the proof is the setup screen coming back seeded: the chip with
`aria-pressed="true"` is the preset's value, not the mode default. That round
trip — save, load back, press Start — is the one a broken translation between
`TimerConfig` and the picker's flat seconds would break, and both sides of it
are valid configs.

## Gotchas

- Editing a preset from a setup screen keys the draft on `mode:presetId`
  (`src/features/timer/setupForm.ts`). A preset write must not reseed a form the
  user is typing in — if a save wipes typed fields, that regression is back.
- A preset row arriving late from IndexedDB is not the same as no row. Untouched
  fields should follow the row when it lands; only fields the user touched stay.
- Delete disarms after 3 s.
