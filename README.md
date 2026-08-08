# Workout Timer

A local-first interval timer PWA for AMRAP, For Time, EMOM, and Tabata workouts. It is built from this repository's Vue starter and follows its Effect, Dexie, testing, accessibility, and offline-first patterns.

The product specification and source reference archive live in [`spec/smartwod-timer-clone`](spec/smartwod-timer-clone/). The archived Google Play images are design references only; the implemented interface and brand are original.

## Features

- Four configurable workout modes with an authoritative timestamp-based timer
- Countdown, pause/resume, round tracking, sound, vibration, and screen wake lock
- Crash and reload recovery for the single active workout
- Reusable presets with duplicate, edit, and delete actions
- Workout history, result notes, round splits, and session details
- English and German UI with light, dark, and system themes
- On-device IndexedDB storage plus validated JSON backup and restore
- Installable PWA that works offline with no account or backend

## Quickstart

```bash
pnpm install
pnpm dev
```

## Quality gates

```bash
pnpm check
pnpm test
pnpm test:a11y
pnpm test:visual
pnpm test:e2e
pnpm test:mutation
pnpm build
pnpm size-limit
```

`pnpm check` runs formatting, linting, type checking, dead-code analysis, unit tests, and architecture tests. The browser suites cover the timer journey, persisted recovery, accessibility, visual baselines, and the production service worker.

## Project map

```text
spec/smartwod-timer-clone/  Product specification and reference archive
src/features/timer/         Timer domain, feedback, and mode UI
src/db/                     Dexie schema, repositories, converters, and backup
src/stores/                 Shared reactive timer data
src/views/                  Route-level timer, history, preset, and settings pages
src/__tests__/              Unit, browser, a11y, architecture, and visual tests
test/e2e/                   Production-build BDD scenarios
```

The architectural boundaries are enforced by tests and lint rules. Feature code owns product behavior, the database layer owns storage, and views compose both without bypassing those seams. More detail is available in [`docs/`](docs/index.md).

## Stack

Vue 3.5 · TypeScript · Vite · Tailwind CSS · Effect · Dexie · Vue Router · vue-i18n · Zod · Vitest · Playwright · vite-plugin-pwa

## Privacy

Workout data stays on the device unless the user explicitly exports a backup. There are no accounts, analytics, advertisements, or network-dependent product features.

## License

[MIT](LICENSE)
