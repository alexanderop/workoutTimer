/**
 * Where an atom may be declared, and what a component may call.
 *
 * The two rules are one rule seen from both ends. State is atoms, so an atom
 * declared anywhere else is state that has gone back into hiding — in a
 * `<script setup>` block that rebuilds it on every mount, or in a `use*`
 * wrapper whose logic no test can reach without rendering something. This
 * codebase had both: seven of its nine `use*` files were a `useAtomValue` line
 * and nothing else, and the four that were not held the exact logic that had no
 * unit test.
 *
 * So: an atom lives in `src/state/`, in a feature's own directory, or in
 * `src/db/atoms.ts` — and the only bridge into a component is `useAtomValue` /
 * `useAtom` / `useAtomSet` / `injectRegistry`.
 *
 * Deliberately text-level, like uiPrimitives.test.ts: a tripwire for a
 * convention, not a type checker. Every rule below is exercised against a
 * synthetic violation as well as the real tree — a rule that only ever sees
 * passing input is not a rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../../', import.meta.url))

interface SourceFile {
  /** Repo-relative, e.g. `src/views/SettingsView.vue`. */
  id: string
  source: string
}

function readSource(directory = SRC): Array<SourceFile> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : readSource(path)
    if (!/\.(ts|vue)$/.test(entry.name)) return []
    return [{ id: `src/${relative(SRC, path)}`, source: readFileSync(path, 'utf8') }]
  })
}

const FILES = readSource()

// --- the rules, as functions, so a synthetic file can be fed to them -------

/**
 * An atom *declaration*. `Atom.map` and `Atom.family` count: they produce an
 * atom, and putting one in a component is the same mistake as `Atom.make`.
 * `.fn(` / `.atom(` catch the runtime-bound forms in `src/db/atoms.ts`.
 */
const DECLARES_ATOM = /\bAtom\.(make|writable|readable|family|fn|fnSync|map|runtime)\s*[(<]/

/** Where one may be declared. */
const ATOM_HOMES = [/^src\/state\//, /^src\/features\/[^/]+\//, /^src\/db\/atoms\.ts$/]

const mayDeclareAtoms = (id: string): boolean => ATOM_HOMES.some((home) => home.test(id))

/**
 * An exported composable, in every shape an export comes in. `use*` inside
 * `src/components/ui/` is the substrate (reka-ui's own primitives,
 * `useForwardProps`) and is not ours to police.
 *
 * The four alternatives are the point. This used to be the first one alone,
 * and so did the ESLint selector it backs up — so "enforced in both layers"
 * described two matchers with the *same* blind spot rather than two that cover
 * for each other. A composable declared plainly and re-exported at the bottom
 * of the file passed both, and a self-test that only ever fed them the inline
 * form could not say so.
 */
const EXPORTS_COMPOSABLE = new RegExp(
  [
    // export function useThing() {}
    String.raw`export\s+(?:async\s+)?function\s+use[A-Z]`,
    // export const useThing = () => {}
    String.raw`export\s+(?:const|let|var)\s+use[A-Z]`,
    // export default function useThing() {}
    String.raw`export\s+default\s+(?:async\s+)?function\s+use[A-Z]`,
    // export { useThing } / export { thing as useThing } / export default useThing
    String.raw`export\s*\{[^}]*\buse[A-Z]`,
    String.raw`export\s+default\s+use[A-Z]`,
  ].join('|'),
)

describe('atoms are declared in one of three places', () => {
  it.each(FILES.filter((file) => DECLARES_ATOM.test(file.source)).map((file) => file.id))(
    '%s is an atom home',
    (id) => {
      expect(mayDeclareAtoms(id)).toBe(true)
    },
  )

  it('finds atoms where they are supposed to be', () => {
    const homes = FILES.filter((file) => DECLARES_ATOM.test(file.source)).map((file) => file.id)

    // A guard against the rule passing because it matched nothing at all.
    expect(homes.length).toBeGreaterThan(8)
    expect(homes).toContain('src/state/route.ts')
    expect(homes).toContain('src/db/atoms.ts')
    expect(homes).toContain('src/features/timer/atoms.ts')
  })

  it.each([
    ['src/views/SettingsView.vue', 'const openAtom = Atom.make(false)'],
    ['src/components/AppShell.vue', 'const x = Atom.map(other, (v) => v)'],
    ['src/lib/utils.ts', 'export const flagAtom = Atom.writable(() => 1, () => {})'],
    ['src/db/backup.ts', 'const a = Atom.family((k: string) => Atom.make(k))'],
  ])('rejects an atom declared in %s', (id, source) => {
    expect(DECLARES_ATOM.test(source) && !mayDeclareAtoms(id)).toBe(true)
  })
})

describe('there are no composables outside the UI substrate', () => {
  it('declares none in app code', () => {
    const offenders = FILES.filter(
      (file) => !file.id.startsWith('src/components/ui/') && EXPORTS_COMPOSABLE.test(file.source),
    ).map((file) => file.id)

    expect(offenders).toEqual([])
  })

  it('catches one when it comes back', () => {
    expect(EXPORTS_COMPOSABLE.test('export function useTheme() { return {} }')).toBe(true)
    expect(EXPORTS_COMPOSABLE.test('export async function useThing() {}')).toBe(true)
    // Scoped to *exports* on purpose. `usePreset(preset)` is a click handler
    // local to PresetsView — the `use` prefix there is English, not a
    // convention, and a rule that flagged it would be noise.
    expect(EXPORTS_COMPOSABLE.test('function usePreset(p: Preset) {}')).toBe(false)
  })

  /**
   * The shapes that walked past both this rule and its ESLint counterpart. A
   * matcher that has only ever been shown the form it was written for is not
   * evidence that the rule holds.
   */
  it.each([
    ['a re-export', 'function useSneaky() {}\nexport { useSneaky }'],
    ['a renamed re-export', 'function sneaky() {}\nexport { sneaky as useSneaky }'],
    ['a default function', 'export default function useSneaky() { return {} }'],
    ['a default identifier', 'function useSneaky() {}\nexport default useSneaky'],
    ['a const arrow', 'export const useSneaky = () => ({})'],
  ])('catches %s too', (_shape, source) => {
    expect(EXPORTS_COMPOSABLE.test(source)).toBe(true)
  })

  it('still leaves an import and a call alone', () => {
    expect(EXPORTS_COMPOSABLE.test(`import { useAtomValue } from '@effect/atom-vue'`)).toBe(false)
    expect(EXPORTS_COMPOSABLE.test('const value = useAtomValue(atom)')).toBe(false)
    expect(EXPORTS_COMPOSABLE.test('export { formatDuration }')).toBe(false)
  })

  /**
   * `src/composables/` is gone, and this is what keeps it from growing back by
   * habit. The same for `src/stores/`, whose name said Pinia about something
   * that was never a store.
   */
  it.each(['composables', 'stores'])('has no src/%s directory', (name) => {
    expect(readdirSync(SRC, { withFileTypes: true }).map((entry) => entry.name)).not.toContain(name)
  })
})
