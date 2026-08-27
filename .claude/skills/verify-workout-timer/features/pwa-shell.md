# PWA shell

The parts that make it an app rather than a page: install, offline, updates,
safe areas.

## Sub-features

- **Install prompt** — a banner ("Install Workout Timer" / *Install* / *Not
  now*) and a dialog with per-platform instructions, also reachable from
  Settings.
- **Service worker** — precaches the shell; the app opens with the network gone.
- **Update prompt** — "A new version is available" with *Reload*.
- **Shell chrome** — bottom nav, safe-area insets, keyboard-aware sheets. The
  run and result screens hide the nav (`meta.hideNav`).

## How to get to it (user POV)

The banner appears on its own. Everything else is ambient.

## Driving it with agent-browser

```bash
agent-browser --session-name wt find role button click --name "Not now"   # dismiss
agent-browser --session-name wt set offline on
agent-browser --session-name wt reload
agent-browser --session-name wt wait --text "Choose a format"
agent-browser --session-name wt set offline off
agent-browser --session-name wt eval 'navigator.serviceWorker.controller !== null'
```

Safe areas and the keyboard need a phone profile and a screenshot:

```bash
agent-browser --session-name wt set device "iPhone 15"
agent-browser --session-name wt screenshot test-results/verify/shell.png
```

## What proves it

The reload with the network off still renders the shell, and
`navigator.serviceWorker.controller` is non-null — the worker served it, the
browser cache did not.

## Gotchas

- **The dev server's service worker is not the shipped one.** `devOptions` is
  enabled in `vite.config.ts`, so offline *looks* verifiable here, but the dev
  worker precaches a different asset graph. This is a smoke check. The real
  answer is `pnpm test:e2e`, which runs `vite preview` on :5678 and asserts the
  worker served the reload (`test/e2e/features/workout.feature`).
- The install banner overlays the run screen's controls until dismissed, and the
  dismissal is per browser profile — a fresh profile brings it back.
- `env(safe-area-inset-*)` is 0 in every headless browser, so a bare `env()`
  bug is invisible here. `src/style.css`'s three clamped `@utility` blocks are
  the only place it may be read; the touch tier and
  `src/__tests__/architecture/touchConventions.test.ts` own that rule.
- This is not an accessibility audit. `snapshot -i` shows what a control is
  *named*; `pnpm test:a11y` runs axe.
