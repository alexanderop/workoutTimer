---
type: Playbook
title: Adding a feature
description: Build order for a new feature, mapped onto the timer worked example, with the test home for every step.
tags: [features, walkthrough, testing]
status: stable
---

# Adding a feature

The timer feature (`src/features/timer`) is the worked example — this walkthrough maps its pieces so you can copy the pattern. Build in this order; every step has a test home.

## 1. Storage (if the feature persists data)

- Define the row in `src/db/converters.ts` as a `Schema.Struct` plus a same-name `interface X extends Schema.Schema.Type<typeof X> {}`. That derived type *is* the domain type — re-export it from `src/db/index.ts` and never hand-write a second copy beside the schema. The schema is the source of truth: Dexie's table typing, the read-path decode, and backup validation all derive from it, so they cannot drift.
- Add the table to `src/db/schema.ts`, typed from that schema. New table on a fresh install → just add it to the **current** version's `stores()`. Changing an existing table → bump the version, write an `upgrade()`, **and** introduce a relaxed `Stored*` schema whose old-shape fields are `Schema.optionalKey`, plus the converter that fills the gap ([local-first.md](local-first.md) for why the migration alone is not enough). Until such a bump exists, stored shape and domain shape are the same and no `Stored*` variant is warranted.
- Add a repository in `src/db/repositories/` and re-export it from `src/db/index.ts`. Nothing outside `src/db` may import deeper than the index — ESLint fails on the import and the arch tests fail your PR. Reads decode every row; writes validate their input. Both fail with tagged errors, not exceptions.
- Add the table to `src/db/backup.ts` in the same commit, reusing the same row schema, and clear it alongside the others in `replaceAllData` — a restore replaces the database, it does not merge into it.
- **Tests**: schema decode rules → unit tier; repository CRUD, rejected rows, and the backup round-trip → `src/__tests__/db/`.

## 2. Domain logic

Pure functions in `src/features/<name>/domain.ts` (sorting, deriving, validating). Keeping them out of components is what makes them unit-tier testable — `src/features/timer/domain.ts` and its spec in `src/__tests__/unit/timer/` are the template. `deriveTimer` shows the payoff: the whole timer is a pure function of the stored session and `now`, so a backgrounded tab or a reload costs nothing and the tricky part is testable without a browser.

The timer splits that module three ways, and a feature with the same shapes should copy the split:

| Module | Holds | Depends on |
| --- | --- | --- |
| `domain.ts` | what the thing *is* — the vocabulary lists, the predicates over them, the deriving | nothing but `@/db` types |
| `labels.ts` | what it *reads like* — pure functions over a `translate`, so the unit tier can hold them without a component | `domain.ts` |
| `setupForm.ts` | the translation between a stored shape and the fields a form binds to | `domain.ts` |

Each gets a thin `use*` composable that binds the reactive or i18n edge (`useTimerLabels`, `useTimerSetupForm`). Anything a screen would otherwise `switch` on belongs in one of them — the arch tier rejects a mode `switch` in a `.vue` file.

## 3. State

Atoms via `@effect/atom-vue` — `src/stores/timerData.ts` is the template. Conventions:

- **Reads are atoms, behind a composable.** Build the atom with `dbRuntime.atom(program)` and wire it with `Atom.withReactivity([SESSIONS_KEY])` (add a key per table), then keep it **module-private** and export a `useYourTable()` beside it that hands back `{ data, failed, settled }` — `useSessions` / `usePresets` / `useTimerSettings` are the templates. Subscribing *is* the load; there is no `onMounted` fetch and no `isLoaded` flag. The composable is where the `AsyncResult` is unwrapped and where the table's empty value lives; a `.vue` file that names `AsyncResult` fails the arch tier.
- **Writes go through a mutation atom** picked to match the tables they touch — `sessionMutation`, `presetMutation`, `settingsMutation`, `workoutStartMutation`, `restoreMutation`, all from `@/db`. Each only accepts `Effect<unknown, never, DbServices>`, so the component composes the repository program with `Effect.catchTag`/`Effect.catchTags` first, then hands it to the setter from `useAtomSet(() => sessionMutation, { mode: 'promise' })`. When the write lands, that atom's keys are invalidated and the read atoms built on them re-read — state always mirrors disk with no store method remembering to re-read.
- **A new table means a new key and a new mutation atom**, not a wider existing one. Invalidating a key you did not write re-reads data nobody changed, and every re-read hands components freshly decoded objects — so any watcher keyed on that identity fires. That is how the setup form used to lose what the user had typed whenever an unrelated write landed.
- Plain UI state (a sheet's open flag, toasts) is a writable `Atom.make(...)` behind a small composable — `src/stores/toast.ts` is the pattern, including the writable `computed` for anything a component two-way binds.
- No `$reset()` needed: atom state lives in the registry, and browser tests get a fresh registry per render (see `src/__tests__/helpers/renderApp.ts`).
- Why not Pinia? Nothing here needs devtools time-travel or plugins — and the registry-scoped atoms give the piece Pinia never had: reads that Effect programs can invalidate, with failures typed all the way into the template.

## 4. UI

- Feature-owned components in `src/features/<name>/components/`. Features never import from other features — shared pieces go to `src/components/` (once they have 2+ consumers).
- Route-level page in `src/views/`, registered in `src/router/index.ts`.
- New tab? Add one entry to `src/router/navigation.ts` — the shell handles the rest. Full-screen route? `meta: { hideNav: true }`.
- Every user-facing string goes through i18n (`src/i18n/messages/en.ts` **and** `de.ts` — the `MessageSchema` type makes a missing key a compile error).
- Give destructive/ambiguous icon buttons an `aria-label` that includes the item name (see `PresetsView.vue`) — the a11y tier will catch bare icon buttons. A destructive action with no undo gets arm-then-confirm, and that gesture is `useArmedAction()`, not a fresh flag and timeout: `armFirst(key)` is false on the first tap and true on the second, the optional key disarms the other rows of a list, and disposing the scope clears the pending timeout.

## 5. Tests, tier by tier

For a feature the size of the timer, the full set is roughly:

| Tier | What to cover |
| --- | --- |
| unit | domain functions, schema decode rules |
| default | the main user flow through the real UI (`timerFlow.spec.ts` pattern: interact, assert UI, assert persistence) |
| a11y | one axe sweep of the new screen; one of any new dialog |
| visual | a screenshot if the screen is part of the shell's core look (`pnpm test:visual:update`) |
| arch | nothing to write — the generic rules pick up new features automatically |
| e2e | only if the feature carries a load-bearing journey (like persistence-across-reload) |

Anything that drives a screen goes through a page object first: a class in
`src/__tests__/pages/` for Vitest browser tiers, and one in `test/e2e/pages/`
when the journey reaches Playwright. `TimerScreen` and `WorkoutPage` are the
worked examples; [vitest-practices.md](vitest-practices.md) owns the details.

## 6. Ship

```bash
pnpm check                     # lint, format, types, knip, unit + arch tiers — one command, ~8 s
pnpm test && pnpm test:a11y    # the browser tiers your feature touches
```

Then walk the flow yourself in a real browser — capture, reload, confirm the row
survived — with [agent-browser](agent-browser.md). A green suite says the code is
right; the walkthrough says the feature is. Anything it turns up gets a test in
the tier that owns it before you commit.

Commit per behavior — the pre-commit gate (~15 s) keeps you honest. CI runs the full matrix on the PR.
