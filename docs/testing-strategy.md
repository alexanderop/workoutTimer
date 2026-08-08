---
type: Architecture Decision
title: Testing strategy
description: Six test tiers, the rule for which tier a given test belongs in, and when a property earns its place.
tags: [testing, tiers, ci, property-testing]
status: stable
---

# Testing strategy

Six tiers, each answering a different question. The point of the tiers is **placement**: every test has exactly one right home, and the cheap tiers stay fast enough to run constantly.

## The tiers

| Tier | Command | Runtime | Question it answers |
| --- | --- | --- | --- |
| unit | `pnpm test:unit` | Node, ~100 ms | Is the pure logic right? |
| default | `pnpm test` | Real Chromium (Vitest browser mode) | Do components and features behave, wired together? |
| a11y | `pnpm test:a11y` | Real Chromium + axe-core | Are rendered screens accessible? |
| visual | `pnpm test:visual` | Real Chromium screenshots | Did the UI change when I didn't mean it to? |
| arch | `pnpm test:arch` | Node + ArchUnitTS/ESLint | Are the layer boundaries intact, and does the enforcement fire? |
| e2e | `pnpm test:e2e` | Playwright against the **production build** | Does the shipped artifact work end to end? |

## Which tier does my test belong in?

Work down this list and stop at the first match:

1. **Pure function, no DOM, no IndexedDB?** → `unit` (`src/__tests__/unit/`). This tier runs in the pre-commit hook, so it must stay in the hundreds of milliseconds. Extract logic out of components into plain `.ts` modules (see `src/features/notes/domain.ts`) precisely so it can live here.
2. **Needs a rendered component, the router, or the database?** → `default` (`src/__tests__/<area>/`). Browser mode means real CSS, real events, real browser APIs — no jsdom approximations. IndexedDB is replaced by fake-indexeddb per test file for speed and isolation.
3. **Asserting on accessibility?** → `a11y` (`src/__tests__/a11y/`). Axe sweeps whole rendered screens; per-control a11y (labels, roles) belongs in the `default` specs that exercise the control. Rules axe classifies as page-level (landmark structure, `region`, `page-has-heading-one`) are skipped when the sweep is scoped to a container, so `assertNoPageLevelViolations` runs them against the document instead. `html-has-lang` and `document-title` are not among them — in this tier they would grade the Vitest runner's page, so the shipped index.html is checked in e2e.
4. **Asserting nothing changed visually?** → `visual` (`src/__tests__/visual/`).
5. **Asserting an import boundary or dependency rule?** → `arch` (`src/__tests__/architecture/`). Two things live there: ArchUnitTS rules over the real module graph, and `boundaries.test.ts`, which feeds ESLint deliberate violations. The second exists because ArchUnitTS does not parse `.vue` files and because "the codebase has no violations" also passes when nothing is being enforced — the actual `.vue` coverage comes from `no-restricted-imports` in `eslint.config.ts`.
6. **Proving a user journey against what actually ships (service worker, real IndexedDB, production bundle)?** → e2e (`test/e2e/`, Gherkin + playwright-bdd). Keep these few and load-bearing — the offline-reload scenario is the canonical example: it cuts the network before reloading, so it fails unless the service worker precached the shell.

## Test quality bar

- Verify observable behavior through the public interface — what a user or caller sees.
- Mock only at system boundaries (time, randomness, network). Never mock internal collaborators; the browser tier exists so you don't have to.
- No call-count/order assertions, no reaching into component internals.
- Browser specs use the fixtures from `src/__tests__/fixtures.ts`; each fixture
  owns reset, mount, and cleanup so order independence cannot be forgotten.
- UI journeys go through screen/page objects whose locators use roles and
  accessible names. Persistence assertions stay in the spec.

## Properties, and when one earns its place

`it.prop` and `it.effect.prop` (from `@effect/vitest`) run a test body against ~100 generated inputs instead of one hand-picked one. They belong to the **unit tier only** — a property is the same test a hundred times over, which pure logic absorbs in milliseconds and the browser tiers cannot afford.

Reach for one when the thing you want to say is true of *every* input rather than at a boundary, and you can state it without reimplementing the code under test. Three shapes cover most cases:

- **Round-trip** — what one direction emits, the other accepts. A converter's output must decode as a stored row again, because it lands in IndexedDB and in the user's next backup.
- **Invariant** — the operation preserves something. `sortSessions` and `sortPresets` are reorderings: same rows out as in, the caller's array untouched, plus the ordering rule between every pair of neighbours (`src/__tests__/unit/timer/domain.spec.ts`).
- **Agreement** — two paths that claim the same rule stay in step. `isTimerConfig` must accept exactly the configs `TimerConfigSchema` accepts; when they diverge, the setup form offers a Start button for a workout the repository will refuse to store.

Where a schema owns the shape, generate from the schema rather than hand-writing an arbitrary: `Schema.toArbitrary(WorkoutSessionSchema)` cannot drift from the validator the repository decodes rows with. That makes the property a test of the schema as well as of the code — which is the point, and worth being ready for. `it.prop` types a `Schema` as an arbitrary directly, but rejects one at runtime in `4.0.0-beta.105`; convert explicitly until that lands.

**A generator that varies everything at once tests nothing.** The agreement property first drew every numeric field independently from a pool of near-miss values. It killed no mutants, and the reason is worth internalising: with four fields off the rails at once, *some* field is always invalid, both sides reject for that reason, and the bound you meant to interrogate never gets asked about. The generator that works starts from a schema-valid config and knocks exactly one field off its bound — valid-except-one is the only input that can tell two statements of a rule apart. The same goes for run count: one bound is a single cell of mode × field × value, so the property runs 1 000 times rather than the default 100.

Keep the examples too. A property pins the *definition* of a behavior; an example pins a specific boundary that must not move, and reads far better when it fails.

**When a property fails, suspect the code before the generator.** The sort property failed roughly one run in four on a generated `updatedAt: Number.NaN`, and the tempting fix — filter NaN out of the generated rows — would have converted a found bug into a hidden one. The generator was right: `Schema.Number` accepts NaN, so the read path accepted it too, and a NaN timestamp compares false against everything, landing the row at an arbitrary place in the list with "NaN days ago" under it. The fix was in `converters.ts` — timestamps are `Schema.Natural` — after which the generator stopped producing the value because the schema stopped allowing it. If a generated input really is impossible, say so in the schema and let the generator follow; narrowing the property is how you lose the read-path hole it just found.

The one narrowing that is honest: the near-miss generator omits optional keys rather than setting them to `undefined`. `Schema.optionalKey` accepts an absent key and rejects a present-but-undefined one, while a hand-written predicate reading `config.timeCapMs === undefined` cannot tell them apart — so generating the second reports a divergence that `TimerConfig` already makes unrepresentable. Narrow when the type system rules the input out, not when the failure is inconvenient.

## Grading the tier itself

The tiers answer "does the code work". [Mutation testing](mutation-testing.md)
answers "would these tests notice if it stopped". `pnpm test:mutation` runs
Stryker over the unit tier's scope in ~10 s and reports which lines the tests
execute without asserting on. It is scoped to the unit tier on purpose, and
reading a survivor has its own procedure — both are in that document.

## The visual tier and its baselines

Screenshot baselines live in `__screenshots__/` and are **platform-specific** (font rendering differs between macOS and Linux). The tier is a local tool by default and is deliberately not in CI:

- After an intentional UI change: `pnpm test:visual:update`, review the diff, commit the new baselines.
- To enable it in CI: run the tier once in a CI job with `--update`, download the Linux baselines as an artifact, commit them, then add a CI job mirroring the a11y one.

## Where the gates run

- **Every commit** (husky, ~15 s): lint-staged, type-check, `test:unit`, knip.
- **While working / before pushing** (`pnpm check`, ~8 s): lint, formatting, types, knip, `test:unit` and `test:arch`, run concurrently and reported together — every gate that needs no browser. Then the browser tiers your change touches. Formatting on commit only reaches staged files, so the `format:check` inside `pnpm check` is what catches the rest.
- **CI on every PR**: everything, with the browser tier sharded, plus the mutation score as its own job (`.github/workflows/ci.yml`).

The principle: the cost of a check should match how often it runs. Fast checks run on every commit; minutes-long tiers are CI's job.
