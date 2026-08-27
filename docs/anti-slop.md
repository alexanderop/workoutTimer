---
type: Convention
title: Evidence, not assertion
description: The vendored anti-slop oxlint rules — what each one rejects, the shape to write instead, and how to re-vendor the plugin.
tags: [lint, oxlint, types, boundaries, vendoring]
status: stable
sources:
  - https://github.com/dmmulroy/anti-slop
---

# Evidence, not assertion

[anti-slop](https://github.com/dmmulroy/anti-slop) is a set of oxlint JS-plugin
rules that reject TypeScript which *claims* more than it has checked. Every
generic rule is on at `error`, plus the opt-in `anti-slop-effect` group, because
`effect` is a direct dependency.

The rules all point at one idea: a type is a claim about a value, and a claim
nobody checked is worse than no claim at all — it reads as safety while
behaving as a cast. What follows is the shape to write instead of each
rejected one.

## `unknown` is not a contract

A parameter, a return, or a dictionary value typed `unknown` is a boundary
nobody parsed. Name the type the caller actually has:

- **The result of `JSON.parse` is `Schema.Json`** — that is exactly what a
  successful parse proves, and no more. `readBackupFile` (`src/lib/backupFile.ts`)
  returns it, and `decodeBackup` (`src/db/backup.ts`) takes it, so the signature
  says it narrows *JSON* to a backup rather than *anything* to a backup.
- **Ask for the members you touch, not the interface they live on.**
  `startPeriodicUpdateCheck` (`src/lib/swUpdateCheck.ts`) takes
  `Pick<ServiceWorkerRegistration, 'installing' | 'update'>`, which is also
  what lets its spec hand in two members instead of fabricating a dozen.
- **A row off disk is what the table claims it is.** `decodeRow`
  (`src/db/repositories/shared.ts`) takes a `StoredRow` — the union Dexie's
  `Table<T, string>` declares — and the `unknown` stays inside
  `Schema.decodeUnknownEffect`, which is the thing that actually checks it.
- **A write edge answers with `void`.** The db mutation atoms
  (`src/db/atoms.ts`) end in `Effect.asVoid`: a write's answer is the
  invalidated read atom, never its own return value, and saying so stops
  `unknown` leaking out to every `@click` handler that awaits one.

## A type assertion states an invariant, or it does not compile

Every non-const `as` needs a `// SAFETY:` comment naming what was checked.
Most of them turn out not to be needed at all — reach for these first:

- **Match against the vocabulary** rather than casting into it:
  `COLOR_SCHEMES.find(…)` (`src/state/theme.ts`), `SUPPORTED_LOCALES.some(…)`
  (`src/state/locale.ts`), `TIMER_MODES.find(…)` (`src/features/timer/domain.ts`).
- **Narrow with `instanceof`**, which is a real check where an assertion is a
  promise — `src/lib/formControl.ts` for a form control, `blurActiveElement` in
  `src/__tests__/paired/focusAndInert.spec.ts` for the active element.
- **One assertion behind a named helper** beats one per call site, when
  neither of the above applies.

Two mechanics worth knowing. The comment must attach to a statement the rule
can see, and an `export const` hides it — put it on the initializer instead of
above the `export`. And a statement written `;(expr as T).x` hides it too; give
the value a name on its own line.

## `typeof` is a representation, not a domain

`typeof x === 'string'` sorts values by how they are stored, which is rarely
the question. Ask the real one:

- **"Is this one of ours?"** → match the app's own list. `toRouteName`
  (`src/state/route.ts`) matches a location against `RouteNames`, which is why
  `RouteSnapshot.name` and `NavItem.routeName` are both `RouteName` rather than
  `string` — a plain string on either side compiles and silently never matches.
- **"Is this the shape I need?"** → a schema or a predicate. `Predicate.isString`
  and a narrowing guard in `src/__tests__/helpers/messageAt.ts`.
- **"Does this API exist here?"** → `'x' in globalThis`, or `x instanceof Function`
  when the point is that it is callable.

## A known value stays known

`satisfies Readonly<Record<TimerMode, …>>` keeps the literal keys while still
failing to compile on a missing member; a plain annotation throws the keys away
and takes the exhaustiveness check with them. `DEFAULT_CONFIGS`, `MODE_FIELDS`
and `RUN_PHASE_WORDS` are the worked examples. The same goes for a helper that
returns an anonymous object: let the return type be inferred.

## An omitted key is omitted, not spread from `{}`

`...(x === undefined ? {} : { x })` becomes two branches that build the object
— `createSession` (`src/db/repositories/sessions.ts`) and `toTimerConfig`
(`src/features/timer/setupForm.ts`). This is also what `Schema.optionalKey`
means: the key is *absent*, never present-and-undefined, and the two branches
are the only way to say that without a cast.

## Vendoring

`tools/oxlint/anti-slop/` is a verbatim copy of the upstream skill's bundled
assets — vendored rather than depended on, which is what upstream asks for, so
the rules are ours to change. It is held out of prettier (`.prettierignore`),
eslint (`app/files-to-ignore`) and oxlint itself (`ignorePatterns`) so a
re-vendor is a clean diff against upstream rather than a reformat.

To re-vendor: copy the new `skills/install-anti-slop/assets/anti-slop/` over
the directory, move `oxlint` and `@oxlint/plugins` to the matching version in
the `lint` catalog (they ship in lockstep), and run `pnpm lint:check`.

Changing a rule means editing it there and saying so here.
