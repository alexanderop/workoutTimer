/**
 * Static tripwires for the rule at the bottom of docs/index.md:
 *
 * > Keep logic in `.ts` modules, not `<script setup>` — that is what makes it
 * > unit-testable and visible to the arch tests.
 *
 * That rule was stated and not enforced, and the result was measurable: the
 * same four-case `switch (mode)` in five screens, the same status array in
 * three, and 200 lines of form translation nothing could reach. All of it
 * moved into `features/timer/` where the unit tier can hold it. These rules
 * are what stop it moving back one screen at a time — nobody writes the fifth
 * copy on purpose; they write the first one, in the screen that needs it.
 *
 * House rules inherited from touchConventions.test.ts: text-level checks
 * rather than a full parse, comments stripped first so prose about a rule
 * cannot trip it, and every helper exercised against a synthetic violation as
 * well as against the real tree — a rule that only ever sees passing input is
 * not a rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url))

interface SourceFile {
  /** Repository-relative, e.g. `src/views/HistoryView.vue`. */
  id: string
  source: string
}

function readVueFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      // __tests__ is not shipped UI, and its fixtures contain violations on
      // purpose — scanning them would make every rule self-defeating.
      return entry.name === '__tests__' ? [] : readVueFiles(path)
    }
    if (!entry.isFile() || extname(entry.name) !== '.vue') return []
    return [{ id: `src/${relative(SRC_DIR, path)}`, source: readFileSync(path, 'utf8') }]
  })
}

const VUE_FILES = readVueFiles(SRC_DIR)

function stripComments(source: string): string {
  return (
    source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // `[^:]` rather than `\s`: a line comment may start immediately after
      // code, but `https://` must not read as one.
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  )
}

// --- V1: a screen dispatches on no union of its own ------------------------

/**
 * Any `switch` in a `.vue` file.
 *
 * This began as `switch (something.mode)`, and the narrower rule leaked
 * exactly the way a narrow rule does: the run screen turned
 * `DerivedTimer['phase']` into a word with a four-case switch that named no
 * mode, so nothing stopped it. A `switch` *is* a dispatch table over a union,
 * and every union this app has belongs to a feature or to `@/db` — so the
 * table belongs there too, where the unit tier can hold it and the compiler
 * can make a new member of the union an error.
 */
const ANY_SWITCH = /\bswitch\s*\(/g

export function modeSwitches(source: string): string[] {
  return [...stripComments(source).matchAll(ANY_SWITCH)].map((match) => match[0])
}

// --- V4: the template does not dispatch on a union either ------------------

/**
 * A `v-if` / `v-else-if` chain comparing one expression against three or more
 * string literals — the same dispatch table V1 bans, written where a `switch`
 * is not spelled `switch`.
 *
 * The setup screen offered its five modes this way: four `routeMode === '…'`
 * branches and a `v-else` for the fifth, which is a `Record<TimerMode,
 * Component>` with the exhaustiveness check taken out. "The tree is the
 * variant" is the rule for a flag that changes *what* renders, and a map of
 * components is how a screen obeys it.
 *
 * Three is the threshold rather than two on purpose: two branches over a
 * platform value (`installPlatform === 'ios'` / `'android'`, each with its own
 * static instructions) is a pair of alternatives, not a table, and turning it
 * into a map would cost more than it explains. By the third branch it is a
 * table.
 */
const BRANCH_CONDITION = /v-(?:else-)?if="([^"]*)"/g
const LITERAL_COMPARISON = /([\w.?![\]$]+)\s*===\s*'([^']*)'/

export function literalDispatchChains(source: string): string[] {
  const byExpression = new Map<string, Set<string>>()

  for (const [, condition] of stripComments(source).matchAll(BRANCH_CONDITION)) {
    const comparison = LITERAL_COMPARISON.exec(condition ?? '')
    if (comparison === null) continue
    const [, expression, literal] = comparison
    const literals = byExpression.get(expression ?? '') ?? new Set<string>()
    literals.add(literal ?? '')
    byExpression.set(expression ?? '', literals)
  }

  return [...byExpression]
    .filter(([, literals]) => literals.size >= 3)
    .map(([expression, literals]) => `${expression} vs ${[...literals].join(', ')}`)
}

// --- V2: the vocabulary is imported, not re-spelled ------------------------

/**
 * An array literal of mode names or session statuses. Two or more of the
 * words is the signal — a single `'amrap'` is a comparison, which is fine;
 * `['amrap', 'forTime']` is a second copy of a list that `TIMER_MODES`,
 * `isActiveSession` and `isFinishedSession` already answer for.
 *
 * Nothing type-checks a string array against a union, which is exactly why
 * this needs a text rule rather than the compiler.
 */
const VOCABULARY = [
  'amrap',
  'forTime',
  'emom',
  'tabata',
  'countdown',
  'running',
  'paused',
  'completed',
  'cancelled',
]
const ARRAY_LITERAL = /\[[^[\]]*\]/g

export function vocabularyLiterals(source: string): string[] {
  return [...stripComments(source).matchAll(ARRAY_LITERAL)]
    .map((match) => match[0])
    .filter((literal) => VOCABULARY.filter((word) => literal.includes(`'${word}'`)).length > 1)
}

// --- V3: AsyncResult is unwrapped in one place -----------------------------

/**
 * `AsyncResult` is the three-state value the read atoms carry. Every screen
 * used to unwrap its own, which is how two of them ended up with a
 * hand-written copy of the default settings row. `state/timerData.ts` does it
 * once, and exports the unwrapped value and the failure flag as separate
 * atoms; screens read those.
 */
export function asyncResultUses(source: string): string[] {
  return [...stripComments(source).matchAll(/\bAsyncResult\b/g)].map((match) => match[0])
}

// --- the rules ------------------------------------------------------------

describe('V1 — no screen dispatches on a union of its own', () => {
  it('finds .vue files to check', () => {
    expect(VUE_FILES.length).toBeGreaterThan(0)
  })

  it.each(VUE_FILES.map((file) => [file.id, file] as const))('%s holds no switch', (_id, file) => {
    const offenders = modeSwitches(file.source)

    expect(
      offenders,
      `${file.id} switches on a union. That switch belongs in the feature that owns the union — labels.ts for what a mode or a phase reads like, domain.ts for what it means, setupForm.ts for what its config holds — where the unit tier can see it and a new member of the union is a compile error in one place. docs/index.md`,
    ).toEqual([])
  })

  it('catches a switch a screen might write, on a mode or on anything else', () => {
    expect(modeSwitches('switch (config.mode) { case "amrap": }')).toHaveLength(1)
    expect(modeSwitches('switch (mode) {}')).toHaveLength(1)
    expect(modeSwitches('switch (session.value?.config.mode) {}')).toHaveLength(1)
    expect(modeSwitches('switch (routeMode.value) {}')).toHaveLength(1)
    // The one this rule was widened for: a switch on a phase names no mode.
    expect(modeSwitches('switch (derived.value?.phase) {}')).toHaveLength(1)
    expect(modeSwitches('switch (status) {}')).toHaveLength(1)
  })

  it('leaves prose and a word that merely contains "switch" alone', () => {
    expect(modeSwitches('// switch (config.mode) {}')).toEqual([])
    expect(modeSwitches('<!-- switch (mode) {} -->')).toEqual([])
    expect(modeSwitches('const Switch = 1; useSwitchable(x)')).toEqual([])
  })
})

describe('V4 — no template dispatches on a union either', () => {
  it.each(VUE_FILES.map((file) => [file.id, file] as const))(
    '%s branches on no union of literals',
    (_id, file) => {
      const offenders = literalDispatchChains(file.source)

      expect(
        offenders,
        `${file.id} branches on ${offenders.join('; ')}. Three or more branches over one expression is a dispatch table: hold the components in a Record keyed by the union (src/features/timer/components/fields/index.ts) and render the one the map hands you, so a new member of the union is a compile error rather than a branch nobody added.`,
      ).toEqual([])
    },
  )

  it('catches the chain this refactor deleted', () => {
    expect(
      literalDispatchChains(`
        <div v-if="routeMode === 'amrap'" />
        <div v-else-if="routeMode === 'forTime'" />
        <div v-else-if="routeMode === 'emom'" />
        <div v-else-if="routeMode === 'tabata'" />
      `),
    ).toHaveLength(1)
  })

  it('leaves a pair of alternatives and non-literal branches alone', () => {
    expect(
      literalDispatchChains(`
        <div v-if="installPlatform === 'ios'" />
        <div v-else-if="installPlatform === 'android'" />
      `),
    ).toEqual([])
    expect(
      literalDispatchChains(`
        <div v-if="loadFailed" />
        <div v-else-if="sessions.length === 0" />
      `),
    ).toEqual([])
    // Three branches over three *different* expressions is not a table.
    expect(
      literalDispatchChains(`
        <div v-if="a === 'x'" /><div v-else-if="b === 'y'" /><div v-else-if="c === 'z'" />
      `),
    ).toEqual([])
    expect(
      literalDispatchChains(
        `<!-- <div v-if="m === 'a'" /><div v-else-if="m === 'b'" /><div v-else-if="m === 'c'" /> -->`,
      ),
    ).toEqual([])
  })
})

describe('V2 — no screen re-spells the mode or status vocabulary', () => {
  it.each(VUE_FILES.map((file) => [file.id, file] as const))(
    '%s spells no mode or status list',
    (_id, file) => {
      const offenders = vocabularyLiterals(file.source)

      expect(
        offenders,
        `${file.id} writes out ${offenders.join(', ')}. Import the answer instead — TIMER_MODES, isActiveSession, isFinishedSession, capturesRoundSplits — because nothing type-checks a string array against a union, so a mode or status added to the type goes missing here in silence.`,
      ).toEqual([])
    },
  )

  it('catches the lists this refactor deleted', () => {
    expect(vocabularyLiterals(`['amrap', 'forTime', 'emom', 'tabata']`)).toHaveLength(1)
    expect(
      vocabularyLiterals(`['countdown', 'running', 'paused'].includes(s.status)`),
    ).toHaveLength(1)
    expect(vocabularyLiterals(`['amrap', 'forTime'].includes(mode.value)`)).toHaveLength(1)
  })

  it('catches the status list too — history builds its filters from FINISHED_STATUSES', () => {
    expect(vocabularyLiterals(`['completed', 'cancelled'].includes(s.status)`)).toHaveLength(1)
    expect(vocabularyLiterals(`const filters = ['all', 'completed', 'cancelled']`)).toHaveLength(1)
  })

  it('leaves a single comparison and unrelated lists alone', () => {
    expect(vocabularyLiterals(`mode === 'amrap'`)).toEqual([])
    expect(vocabularyLiterals(`status === 'completed'`)).toEqual([])
    expect(vocabularyLiterals(`['all', ...FINISHED_STATUSES]`)).toEqual([])
    expect(vocabularyLiterals(`// ['amrap', 'forTime', 'emom']`)).toEqual([])
  })
})

describe('V3 — AsyncResult is unwrapped by the store, not by a screen', () => {
  it.each(VUE_FILES.map((file) => [file.id, file] as const))(
    '%s reads no AsyncResult',
    (_id, file) => {
      expect(
        asyncResultUses(file.source),
        `${file.id} unwraps an AsyncResult. Read sessionListAtom / presetListAtom / timerSettingsValueAtom and the matching *LoadFailedAtom from @/state/timerData instead — the fallback for a table lives with the table, which is what stopped two screens carrying their own copy of the default settings row.`,
      ).toEqual([])
    },
  )

  it('catches an unwrap a screen might write', () => {
    expect(asyncResultUses('AsyncResult.getOrElse(result.value, () => [])')).toHaveLength(1)
    expect(asyncResultUses('// AsyncResult.isFailure(x)')).toEqual([])
  })
})
