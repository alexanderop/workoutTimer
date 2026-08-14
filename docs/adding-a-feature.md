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
- **Tests**: all of it in the Node tier — `src/__tests__/unit/db/` covers schema decode rules, repository CRUD, rejected rows, the backup round-trip and each `upgrade()`. The browser tier replaces IndexedDB with `fake-indexeddb` anyway, so a db spec there was paying for a Chromium boot and not using it; `import 'fake-indexeddb/auto'` at the top of the file is the whole setup.

## 2. Domain logic

Pure functions in `src/features/<name>/domain.ts` (sorting, deriving, validating). Keeping them out of components is what makes them unit-tier testable — `src/features/timer/domain.ts` and its spec in `src/__tests__/unit/features/timer/` are the template. `deriveTimer` shows the payoff: the whole timer is a pure function of the stored session and `now`, so a backgrounded tab or a reload costs nothing and the tricky part is testable without a browser.

The timer splits that module four ways, and a feature with the same shapes should copy the split:

| Module | Holds | Depends on |
| --- | --- | --- |
| `domain.ts` | what the thing *is* — the vocabulary lists, the predicates over them, the deriving | nothing but `@/db` types |
| `labels.ts` | what it *reads like* — pure functions over a `translate` | `domain.ts` |
| `setupForm.ts` | the translation between a stored shape and the fields a form binds to, as one draft atom per thing being edited | `domain.ts`, `@/state` |
| `atoms.ts` | what the screens read — derivations over the shared read atoms | `domain.ts`, `@/state` |

The first two are pure and need no binding layer: a screen calls `modeName(mode, t)` from its template, because a value derived only from arguments and translations is a plain function, not a memo and not a composable. Anything a screen would otherwise `switch` on belongs in one of these — the arch tier rejects a mode `switch` in a `.vue` file.

## 3. State

Atoms via `@effect/atom-vue` — `src/state/timerData.ts` is the template, and `src/state/` (shared) or `src/features/<name>/atoms.ts` (yours) is where the atom goes. Conventions:

- **Reads are atoms, and the `AsyncResult` is unwrapped once.** Build the atom with `dbRuntime.atom(program)` and wire it with `Atom.withReactivity([SESSIONS_KEY])` (add a key per table), then keep it **module-private** and export the unwrapped derivations beside it — `sessionListAtom` (rows, empty while loading or failed) and `sessionsLoadFailedAtom` (the flag the error panel reads) are the templates. Subscribing *is* the load; there is no `onMounted` fetch and no `isLoaded` flag. The table's empty value lives with the table, and a `.vue` file that names `AsyncResult` fails the arch tier.
- **Writes go through a mutation atom** picked to match the tables they touch — `sessionMutation`, `presetMutation`, `settingsMutation`, `workoutStartMutation`, `restoreMutation`, all from `@/db`. Each only accepts `Effect<unknown, never, DbServices>`, so the component composes the repository program with `Effect.catchTag`/`Effect.catchTags` first, then hands it to the setter from `useAtomSet(() => sessionMutation, { mode: 'promise' })`. When the write lands, that atom's keys are invalidated and the read atoms built on them re-read — state always mirrors disk with no store method remembering to re-read.
- **A new table means a new key and a new mutation atom**, not a wider existing one. Invalidating a key you did not write re-reads data nobody changed, and every re-read hands components freshly decoded objects — so any watcher keyed on that identity fires. That is how the setup form used to lose what the user had typed whenever an unrelated write landed.
- Plain UI state (a sheet's open flag, a pending flag, toasts) is a writable `Atom.make(...)` at module scope, or an `Atom.family` when there is one per instance — `src/state/toast.ts` and `src/state/pending.ts` are the patterns. **Do not wrap it in a composable**; the component calls `useAtomValue`/`useAtom`/`useAtomSet` directly, and a `use*` export is a lint error.
- **Something imperative to do?** An `Atom.fnSync` when the caller only fires it (`showToastAtom`), a registry-taking function when the caller needs the result in the same handler (`requestConfirmationIn`) — `useAtomSet` returns a setter, not a value. Both are drivable from a bare `AtomRegistry.make()`, which is the whole reason they are not composables.
- **Name it for its tier**: `xxxAtom` for a value (unit tier), `xxxEffectAtom` for a subscription/side effect (browser tier).
- No `$reset()` needed: atom state lives in the registry, and browser tests get a fresh registry per render (see `src/__tests__/helpers/renderApp.ts`).
- Why not Pinia? Nothing here needs devtools time-travel or plugins — and the registry-scoped atoms give the piece Pinia never had: reads that Effect programs can invalidate, with failures typed all the way into the template.

## 4. UI

- Feature-owned components in `src/features/<name>/components/`. Features never import from other features — shared pieces go to `src/components/` (once they have 2+ consumers).
- Route-level page in `src/views/`, registered in `src/router/index.ts`.
- New tab? Add one entry to `src/router/navigation.ts` — the shell handles the rest. Full-screen route? `meta: { hideNav: true }`.
- Every user-facing string goes through i18n (`src/i18n/messages/en.ts` **and** `de.ts` — the `MessageSchema` type makes a missing key a compile error).
- Give destructive/ambiguous icon buttons an `aria-label` that includes the item name (see `PresetsView.vue`) — the a11y tier will catch bare icon buttons. A destructive action with no undo gets arm-then-confirm, and that gesture is `src/state/confirmation.ts`, not a fresh flag and timeout: `requestConfirmationIn(registry, scope, key)` is false on the first tap and true on the second, the key disarms the other rows of a list, and the atom's finalizer clears the pending timeout when the screen goes. Read `armedConfirmationAtom(scope)` too — the label depends on it, and the subscription is what gives the expiry a registry to write back to.

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
