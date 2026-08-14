---
okf_version: "0.2"
---

# vue-pwa-starter knowledge

## What this is

A local-first Vue 3 PWA workout timer, built on this repo's starter template. Data lives in the browser (Dexie/IndexedDB) — no backend, no accounts. Mobile-first: the app shell, safe-area handling, and keyboard-aware sheets are the product. The `timer` feature (`src/features/timer/`) is the worked example every convention below points at.

When in doubt about a design call: does it keep interactions instant and the data on-device?

## How to read this

This file is the entry point. It holds the rules; the concept files it links hold the reasoning behind them, as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) v0.2 bundle — one concept per markdown file, YAML frontmatter (`type`, `title`, `description`, `tags`, `status`), relative links between them. Follow a link when your task touches it; do not read the tree top to bottom.

There is no `CLAUDE.md` and no `AGENTS.md`. A `SessionStart` hook (`.claude/hooks/docs.mjs`) injects this file into every agent session verbatim, so agents and humans read the same file and the conventions exist in one copy. An agent that changes a rule changes it here.

| Concept | Read it when |
| --- | --- |
| [Local-first](local-first.md) | Deciding whether something belongs on-device, or how a schema change stays readable |
| [Adding a feature](adding-a-feature.md) | Building a new feature — the build order and the test home for each step |
| [Testing strategy](testing-strategy.md) | Choosing which tier a test belongs in, or whether to write a property |
| [Vitest practices](vitest-practices.md) | Writing browser specs with fixtures, screen objects, helpers, tags, and ARIA snapshots |
| [What jsdom cannot see](jsdom-vs-browser.md) | Justifying the cost of a browser tier, or wondering whether a spec could move to jsdom |
| [Driving the app with agent-browser](agent-browser.md) | Verifying a feature yourself in a real browser — before claiming it works |
| [Mutation testing](mutation-testing.md) | Reading a surviving mutant, or changing what `pnpm test:mutation` grades |
| [UI components](ui-components.md) | Any work in `src/components/ui/` — adding a primitive, or wondering why a component takes `class` |
| [Touch conventions](touch-conventions.md) | Adding any control, or touching the shell, safe areas, or a sheet — the rules that make it feel native |
| [Effect](effect/index.md) | Any Effect work — branch chooser into the per-topic concepts |

Adding a doc means adding a concept file with frontmatter and linking it from this table, so the bundle stays conformant and navigable.

## Commands

```bash
pnpm check          # ← verify your work: lint + format + types + knip + unit + arch,
                    #   in parallel (~8 s), continuing past the first failure so one
                    #   run reports every problem. No browser needed. Run this before
                    #   claiming a change is done.
pnpm dev            # Dev server
pnpm test:unit      # Node unit tier — pure logic, ~100 ms
pnpm test           # Browser tier (Vitest browser mode)
pnpm test:touch     # Coarse-pointer tier — the only one under touch emulation
pnpm test:a11y      # axe-core sweeps + ARIA snapshots (-- --update to rebaseline)
pnpm test:visual    # Screenshot comparisons (test:visual:update to rebaseline)
pnpm test:arch      # ArchUnitTS boundary rules
pnpm test:mutation  # Stryker over the unit tier (~10 s) — grades the assertions,
                    #   not the coverage. mutation-testing.md before editing the
                    #   scope in stryker.config.mjs.
pnpm test:e2e       # playwright-bdd against the production build
pnpm lint           # oxlint + eslint + markdownlint (fix mode; lint:check to verify)
pnpm format         # prettier (format:check to verify — CI runs the check)
pnpm type-check     # vue-tsc --build
pnpm knip           # Dead exports
pnpm build          # Production build (+ pnpm size-limit for the budget)
```

`pnpm check` covers every gate that runs without a browser; the lint and
formatting parts of it are fixable with `pnpm lint` and `pnpm format`. The
browser tiers (`test`, `test:touch`, `test:a11y`, `test:visual`, `test:e2e`) cost
minutes and stay separate — run the ones your change touches, and let CI run the
rest.

## Effect

`effect` is pinned to exactly `4.0.0-beta.105`. Start at
**[effect/index.md](effect/index.md)** — the conventions and the branch chooser
into per-topic concepts (schema, services and layers, config, scheduling,
caching, streams, HTTP clients, testing). Read
[effect/conventions.md](effect/conventions.md) for any Effect work, then only
the branches your task touches.

When the concepts do not answer the question, read the Effect source itself. It
is the `effect` reference — checked out to match the pin, and announced to every
session by the hook described under **References**, so nothing here has to point
at it.

Online docs and v3 training data describe a different API; do not use them.
Bumping the pin means moving the reference clone's pinned branch too, and
re-checking the `docs/effect/` concepts against it.

Where the concepts and this file disagree about *this* codebase, this file
wins — the concepts describe Effect, the **Critical conventions** below
describe our use of it.

## References

Source trees this project reads but does not vendor. `.claude/references.json`
is the registry; a `SessionStart` hook (`.claude/hooks/references.mjs`) resolves
it, clones anything missing into `~/Projects/opensource/<alias>` in the
background, and injects each entry into the session as `<available_references>`
so an agent knows the tree exists without being pointed at it. It is the sibling
of the hook that injected this file — same wire format, same two harnesses.

One registry, one script, two harnesses: `.claude/settings.json` registers both
hooks with Claude Code and `.codex/hooks.json` registers the same scripts with
Codex, which reimplements Claude Code's hook format down to the
`hookSpecificOutput.additionalContext` payload. Two differences are load-bearing
and the reason the Codex command reads the way it does: Codex sets no
`$CLAUDE_PROJECT_DIR` (hence `git rev-parse --show-toplevel`), and its session
`cwd` is wherever you started it, so each script climbs to what it needs rather
than assuming the repository root. Codex also refuses to run a project hook it
has not been shown — the first session lists it as untrusted and asks; until you
accept, this file and the references are silently unadvertised. Editing a hook
resets that.

Both hooks are registered for `clear` and `compact` as well as `startup` and
`resume`: injected context is part of the conversation, so without those the
rules would vanish the first time a session compacted.

```jsonc
{
  "effect": {
    "repository": "Effect-TS/effect",   // owner/repo, host/path, or a git URL
    "branch": "pinned/4.0.0-beta.105",  // clone-time ref; omit for the default
    "description": "…"                  // no description ⇒ cloned but unadvertised
  },
  "docs": "../product-docs"             // shorthand: ./ ~/ or / ⇒ path, else repository
}
```

Add machine-local references in `.claude/references.local.json` (gitignored,
same shape, wins on alias collision) rather than editing the committed file.

Refresh is `git fetch` only, so a `pinned/<version>` checkout is never moved
under you — set `"pull": true` per entry to fast-forward, `"refresh": false` to
leave a tree alone. Bumping a pin is still the manual `git checkout -b` in
`~/Projects/opensource/effect`; the hook will not do it.

`.claude/settings.json` grants `~/Projects/opensource` through
`permissions.additionalDirectories`, but **project-level grants only apply once
you have accepted the workspace trust dialog** — until then Claude Code prints a
warning and the reference paths are advertised but unreadable. Codex needs no
counterpart: reads are unrestricted in every one of its sandbox modes. What it
does need is the project marked trusted, since it ignores `.codex/` entirely in
an untrusted directory.

## Critical conventions

- **State is atoms, and only atoms.** `@effect/atom-vue` (pinned in lockstep with `effect`) is this app's reactivity system — NOT Pinia, NOT VueUse, and **not Vue's `ref`/`computed`/`watch`/`reactive`, which are a lint error outside `src/components/ui/`** (`NO_VUE_REACTIVITY` in `eslint.config.ts`; `defineModel` is banned by `no-restricted-syntax` for the same reason — it compiles to a writable `ref`). Everything is an atom in a registry: shared state (`src/state/timerData.ts`), derived state (`Atom.map` / `Atom.make((get) => …)` — `src/features/timer/atoms.ts`), component-local state (`Atom.make(false)` at module scope, or an `Atom.family` when there is one per instance), and **side effects**, which are an atom whose read calls `get.subscribe(…, { immediate: true })` and `get.addFinalizer` — that is what every `watch(x, effect, { immediate: true })` became (`src/state/theme.ts` is the shape). Subscribing is what starts it; the last unsubscribe is what stops it. `useAtomValue`/`useAtom`/`useAtomSet`/`injectRegistry` are the one bridge into a component; a value derived only from props and translations is a plain function called from the template, not a memo. Three things are deliberately still Vue: `useTemplateRef` (a DOM handle is not state), `useRouter()` in an event handler (navigation is imperative), and `t()` from vue-i18n. The registry is provided in `main.ts`; tests provide a fresh one per render instead of `$reset()`, and an atom is testable by seeding a bare `AtomRegistry.make()` with no component at all (`src/__tests__/unit/harness.ts` is the three-line harness every unit-tier atom spec uses).
- **An atom is declared in `src/state/`, in a feature's own directory, or in `src/db/atoms.ts` — and nowhere else.** There is no `src/stores/` and no `src/composables/`: both were places an atom's *home* was decided by history rather than by layer. `src/state/` holds every shared atom, one file per concern (`browser`, `route`, `timerData`, `toast`, `pending`, `confirmation`, `theme`, `locale`, `keyboard`, `install`, `swUpdate`, `pwa`); `src/lib/` is what is left once the atoms are out of it — pure functions and platform plumbing. **There are no composables**: a `use*` wrapper around `useAtomValue` is a layer that adds nothing and costs a test, so exporting one is a lint error outside `src/components/ui/` (where reka-ui's own `useForwardProps` is the substrate). Anything imperative is an `Atom.fnSync` (`showToastAtom`, `dismissInstallHintAtom`) or a registry-taking function when the caller needs the answer in the same handler (`requestConfirmationIn`, `promptInstallIn`, `showToastIn`) — both drivable from a bare registry, which is exactly what made the arming rule and the failure reporter testable at all. Enforced twice, like every other boundary here: `no-restricted-syntax` in `eslint.config.ts` for the composable ban, `src/__tests__/architecture/atomPlacement.test.ts` over the real tree for both rules.
- **Name a value atom `xxxAtom` and a side effect `xxxEffectAtom`**, because the suffix decides the tier. A value atom is a derivation over other atoms and belongs in the Node unit tier against `AtomRegistry.make()`; an effect atom subscribes to a platform API or writes to the document and belongs in the browser tier. `isDarkAtom` / `themeEffectAtom` is the pair to copy. Two consequences worth knowing before you write one: **writing an unmounted function atom is a no-op** (`Atom.fnSync`, `Atom.fn`, a `dbRuntime.fn` mutation edge — `useAtomSet` mounts what it writes, a bare registry has to `subscribe` first), and **a timer an atom starts must be cancelled by that atom's finalizer** or it outlives the registry — `toastExpiryEffectAtom` exists because the browser tier caught a dismissal firing into a disposed registry.
- **Browser state — localStorage, `matchMedia`, a ticking clock, `visibilitychange`, coarse-pointer detection — is in `src/state/browser.ts`**, and it is the one module in `src/state/` a UI primitive may import. That is the browser's state, not the app's; everything else under `src/state/` stays out of `src/components/ui/` (`NO_APP_STATE` in `eslint.config.ts` carries the re-include, and `boundaries.test.ts` asserts the exception is still live — gitignore's parent-directory rule kills a `!` pattern silently).
- **The route is an atom too.** `useRoute()` hands back a Vue-reactive object, so `src/state/route.ts` snapshots every navigation into `routeAtom` and exposes `routeParamAtom('id')` / `routeQueryAtom('preset')` / `routeNameAtom` — read those, never the snapshot, since only the narrow atoms dedupe. `connectRoute(router, registry)` is the whole bridge, called once from `main.ts` and once from the test `renderApp` helper; a component harness that mounts something route-aware has to call it too. Its write side, `navigationAtom`, exists for the rare case of an *atom* deciding the app should be elsewhere (`src/features/timer/runDriver.ts` sending a finished workout to its result screen).
- **DB**: all access via `src/db/index.ts` repositories. The store is at schema v2 (`soundVolume` on settings is the worked example). Changing an existing table means a version bump **plus** a read-path that still accepts the old shape — [local-first.md](local-first.md) for why both are needed and neither is enough.
- **One schema per row, in `src/db/converters.ts`**: a `Schema.Struct` plus a same-name `interface X extends Schema.Schema.Type<typeof X> {}` is the source of truth, and the domain names the rest of the app uses (`WorkoutSession`, `TimerConfig`, …) *are* those derived types. Dexie's table typing, the read-path decode, and backup validation all come from the same declaration. Never hand-write a TypeScript type beside a schema for the same data — they drift silently, and the drift shows up as casts bridging two things that were supposed to be one. Types are re-exported from `@/db`; there is no `src/types/` module for persisted shapes. Drafts (what a component hands *in*, before trimming and validation) take the schema's `Encoded` side — `typeof PresetDraftSchema.Encoded`. IndexedDB is untrusted input: repositories decode every row on read and validate every draft on write, both failing with tagged errors.
- **DB is Effect-based**: repositories are `Context.Service` classes with `Layer`s (`src/db/repositories/workouts.ts` is the worked example); failures are tagged errors (`Schema.TaggedError`, `src/db/errors.ts`) visible in each program's type; validation uses `effect/Schema` (not zod). **Effect does not stop at the Vue boundary — it meets Vue at atoms**: reads that drive the UI are atoms built with `dbRuntime.atom(program)` and wired with `Atom.withReactivity([SESSIONS_KEY])` (`src/state/timerData.ts` is the worked example) — their `AsyncResult` value carries loading, failure, and data typed into the template, and subscribing is the load. **The read atom stays private to that module and the `AsyncResult` is unwrapped exactly once**, into a value atom (`sessionListAtom`) and a failure flag (`sessionsLoadFailedAtom`); the empty value for a table lives with the table. When each screen unwrapped its own, two of them ended up carrying a hand-written copy of the default settings row, which had to be patched by hand when db v2 added `soundVolume` — `src/__tests__/architecture/viewLogic.test.ts` now fails a `.vue` file that so much as names `AsyncResult`. Writes are programs the component composes and hands to a **mutation atom** via `useAtomSet(() => sessionMutation, { mode: 'promise' })`; like `runDb`, it accepts only `Effect<unknown, never, DbServices>`, so every failure must be handled inside Effect with `Effect.catchTag`/`Effect.catchTags` first — an unhandled `DatabaseError` is a type error, not a runtime surprise — and a landed write invalidates that atom's reactivity keys, so the read atoms built on them re-read from disk (no manual re-read). `runDb` remains the imperative edge for programs that read and leave (backup export, test assertions).
- **Pick the mutation atom that matches the tables you write** (`src/db/atoms.ts`): `sessionMutation`, `presetMutation`, `settingsMutation`, `workoutStartMutation` (a session *and* the preset's `lastUsedAt`), `restoreMutation` (everything). There is deliberately no single write edge that invalidates all three keys, because over-invalidating is not merely wasteful: a re-read hands components a fresh array of freshly decoded objects, and **anything keyed on that identity re-runs**. That is a real bug this app shipped — pausing a timer re-read presets, which re-ran the setup screen's "seed the form from the preset" watcher and discarded what the user had typed. Two things now guard against it, and both are worth copying when you add a form: the draft is an `Atom.family` keyed on *what is being edited* (`${mode}:${presetId}` — see `src/features/timer/setupForm.ts`), so a preset write cannot change which atom the screen reads; and the seeding rule inside it is stated rather than implied, as **two atoms and no flag** — a seed derived from the table, an edit that is `undefined` until the user types, and a draft that is `edit ?? seed`. Write that rule as a `let seeded` in the family factory and it is silently wrong: **a family memoizes one atom object per key at module scope, so every registry shares whatever the factory closed over** — the flag, a timeout handle, a captured registry. Mutable state belongs in an atom's value or inside a single read's lifetime (`get.addFinalizer`), never in the factory; `src/state/confirmation.ts` is the worked example of the lifetime form. Adding a table means adding its key and the atom that invalidates it, not widening an existing one. No try/catch and no `instanceof` in `.vue` files; `src/views/SettingsView.vue` is the worked example (three failure types, one exhaustive `catchTags`). Pure Effect programs are tested with `it.effect` from `@effect/vitest` in the unit tier (worked example: `src/__tests__/unit/db/backup.spec.ts`); browser-tier tests say what they mean about failure with `Effect.orDie` (a failure would break the test) or `Effect.flip` (the failure *is* the assertion). Inside a program, log with `Effect.logError` + `Effect.annotateLogs`, not `console.error` in an `Effect.sync` — that keeps the entry on the fiber and the span `Effect.fn` opened.
- **Where Effect starts and stops**: everything reachable from `@/db` — persistence, backup payloads, and the domain rules over them (`src/lib/backupFile.ts` is on this side, since a component composes it into one `catchTags` with the db programs). Browser-platform plumbing with no domain content stays plain async TypeScript: `src/lib/persistentStorage.ts` and `src/lib/swUpdateCheck.ts` use try/catch on purpose. If a failure needs a name the UI can match on, it belongs in Effect; if the only response is `console.debug`, it does not.
- **One layer stack, two runtimes**: `src/db/layer.ts` defines `dbLayer`, and both the atom runtime (`src/db/atoms.ts`) and the ManagedRuntime behind `runDb` (`src/db/runtime.ts`) are built from it. They are separate contexts, so a repository layer merged into one is invisible to the other — add new layers in `layer.ts` and nowhere else. `src/lib/observability.ts` rides along there: OTLP tracer + logger from `effect/unstable/observability` (no `@opentelemetry/*` dependency), gated on `import.meta.env.DEV && VITE_OTLP_URL` so it is dead code in production. The spans it exports are the `Effect.fn('WorkoutsRepo.listSessions')` names already in the repositories — instrument by naming the `Effect.fn`, not by adding an exporter call.
- **UI is shadcn-vue-style primitives over reka-ui — the pattern is copied, not installed**: `src/components/ui/<name>/` holds one directory per primitive, one file per part, plus an `index.ts` barrel that is the only way in (`src/components/ui/dialog/` is the worked example — `Dialog` provides, `DialogContent`/`Header`/`Footer`/`Title`/`Description`/`Close` compose). `reka-ui` and `class-variance-authority` are the private substrate of that directory: importing either anywhere else is a lint error, as is reaching past a barrel, and a primitive may not import `@/db`, a feature, or anything under `@/state/` except `@/state/browser`. Every part follows the same five moves — accept the reka part's props **plus** `class`, `reactiveOmit(props, 'class')`, `useForwardProps`/`useForwardPropsEmits` for the rest, a `data-slot` naming the part, and `cn(defaults, props.class)` so the call site's classes win via `tailwind-merge`. **The tree is the variant**: a flag that changes *what* renders (`mode`, `showHeader`) is a missing child component, not a prop — `variant`/`size`/`class` change *how* and are fine, and belong in a `cva()` table in the barrel. A flat convenience wrapper (`<ConfirmDialog>`) is built *on top of* the primitives, never as flags on them. Enforced twice, like the db boundary: `no-restricted-imports` for the imports, `src/__tests__/architecture/uiPrimitives.test.ts` for file shape (barrel export, `data-slot`, `class` merged through `cn()`, at most three self-declared props beyond `class`). Full reasoning and the deliberate deviations from upstream: [ui-components.md](ui-components.md).
- **Features never import other features**; shared layers never import features. Enforced twice: ArchUnitTS in `src/__tests__/architecture/` reads the TypeScript module graph, and `no-restricted-imports` in `eslint.config.ts` covers `.vue` files, which ArchUnitTS does not parse.
- **Two-way binding**: a `modelValue` prop plus an `update:modelValue` emit, bound by the parent as `:model-value` / `@update:model-value` against an atom and its setter (`useAtom` returns a *readonly* ref, so `v-model` would not work anyway). `defineModel` survives only inside `src/components/ui/`, where a primitive forwards the model straight to the reka part that already owns it (`Switch` → `SwitchRoot`) and the ref never reaches app code.
- **i18n**: every user-facing string in `src/i18n/messages/en.ts` and `de.ts`; the schema type makes missing keys a compile error.
- **Every control answers a finger, and every environment value is clamped.** Tailwind v4 gates `hover:` behind `@media (hover: hover)`, so a control whose only feedback is a `hover:` answers a phone tap with nothing — press states are `active:`, and the transition list names `scale` (v4 compiles `scale-*` to the standalone `scale` property, so `transform` covers nothing). Sizes are written touch-first and collapse with `pointer-fine:`, so the 44px floor is the default. `env(safe-area-inset-*)` may only be read inside the three clamped `@utility` blocks in `src/style.css` — a bare `env()` is 0 on flat-bottomed hardware and in every headless browser, which is every place anyone looks, and pairing one with `pb-6` hands `padding-bottom` to stylesheet order. Selection is suppressed globally and granted back to prose (`select-text`) and fields **in the same commit** — global `user-select: none` without the input exemption breaks caret placement on iOS and on no desktop browser. Enforced three ways: `src/__tests__/architecture/touchConventions.test.ts` for coverage, the `touch` tier for sizing, and browser specs for the sheet inset, overscroll containment, and selection. Full reasoning: [touch-conventions.md](touch-conventions.md).
- **Tests are not colocated**: they live in `src/__tests__/`, mirroring the source tree. Which tier a test belongs in: [testing-strategy.md](testing-strategy.md).
- **Keep logic in `.ts` modules, not `<script setup>`** — that is what makes it unit-testable and visible to the arch tests, and it is now enforced rather than merely stated (`src/__tests__/architecture/viewLogic.test.ts`: no mode `switch` in a `.vue` file, no array literal of mode names or session statuses, no `AsyncResult`). The shapes it pushes you towards, using the timer as the worked example:
  - **A `switch` on a domain union belongs to the feature, once.** `features/timer/labels.ts` is what a timer *reads like* — `modeName`, `modeDescription`, `configSummary`, `humanizeSeconds` — as pure functions over a `translate`, called straight from a template as `modeName(mode, t)`. Keys are built by template literal off `TimerMode`, so a new mode is a compile error there instead of a blank label at runtime.
  - **A vocabulary is a list, not a literal.** `TIMER_MODES` is read off `DEFAULT_CONFIGS`, `FINISHED_STATUSES` is filtered out of `SESSION_STATUSES`, `START_COUNTDOWN_OPTIONS` feeds both `Schema.Literals` and the `<select>`. Nothing type-checks a string array against a union, so the list has to be the union's own.
  - **A form is a translation, and translations are testable.** `features/timer/setupForm.ts` converts between a `TimerConfig` and the flat seconds a picker binds to, and holds the draft itself as one atom per `mode:presetId`. The round trip — save a preset, load it back, press Start — is a property over the config schema, because both sides of a broken translation are valid configs and nothing else would catch it.
  - **A gesture is an atom.** `src/state/confirmation.ts` is the arm-then-confirm two-tap that guards every destructive action, including the disarm each hand-rolled copy had to remember — as a finalizer, so "clear the timeout" and "the caller went away" are the same event.

## Git workflow

Conventional Commits with scope (`feat(notes): …`). The husky pre-commit gate (~15 s) runs lint-staged, type-check, test:unit, and knip on every commit — do not bypass it with `--no-verify`. Browser/a11y/visual/e2e tiers are CI's job (`.github/workflows/ci.yml`); run the ones your change touches before pushing.

## Conventions in this bundle

- Every non-index file carries `type`, `title`, `description`, `tags`, and `status`. `type` is one of `Playbook`, `Architecture Decision`, `Convention`, or `Reference`.
- Content vendored from elsewhere carries a `sources` entry naming where it came from — that is the provenance record, so there is no separate lockfile.
- Links are relative, so they resolve both on GitHub and for a consumer walking the directory.
