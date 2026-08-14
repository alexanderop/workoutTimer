/**
 * The negative half of the architecture tier.
 *
 * `architecture.test.ts` asserts the codebase currently obeys the rules —
 * which is exactly the assertion that passes when nothing is being enforced.
 * With a single feature checked in, its feature-isolation loop builds zero
 * rules; and ArchUnitTS never parses .vue files, so a violation written in a
 * `<script setup>` block was invisible to it.
 *
 * These tests come at it from the other side: feed ESLint a file that breaks
 * each boundary and assert it is rejected. ESLint is the layer that covers
 * .vue, so this is also the proof that the SFC hole is closed.
 */
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const RULE = 'no-restricted-imports'

let eslint: ESLint

beforeAll(() => {
  // Not the cached instance the CLI uses: these files never exist on disk.
  eslint = new ESLint({ cwd: new URL('../../../', import.meta.url).pathname })
})

/** Rule ids reported for `code` if it lived at `filePath`. */
async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId ?? 'fatal')
}

const sfc = (importLine: string) =>
  `<script setup lang="ts">\n${importLine}\n</script>\n\n<template>\n  <div />\n</template>\n`

describe('feature isolation', () => {
  it('rejects a feature importing another feature', async () => {
    const rules = await lint(
      'src/features/timer/domain.ts',
      `import { thing } from '@/features/other/thing'\nexport const x = thing\n`,
    )
    expect(rules).toContain(RULE)
  })

  it('rejects it from a .vue file too — the case ArchUnitTS cannot see', async () => {
    const rules = await lint(
      'src/features/timer/components/ModeCard.vue',
      sfc(`import { thing } from '@/features/other/thing'\nvoid thing`),
    )
    expect(rules).toContain(RULE)
  })

  it('allows a feature to import itself', async () => {
    const rules = await lint(
      'src/features/timer/components/ModeCard.vue',
      sfc(`import { formatDuration } from '@/features/timer/domain'\nvoid formatDuration`),
    )
    expect(rules).not.toContain(RULE)
  })
})

describe('shared layers', () => {
  it.each([
    ['src/components/AppShell.vue', sfc(`import { x } from '@/features/timer/domain'\nvoid x`)],
    ['src/state/thing.ts', `export { x } from '@/features/timer/domain'\n`],
    ['src/lib/thing.ts', `export { x } from '@/features/timer/domain'\n`],
    ['src/db/thing.ts', `export { x } from '@/features/timer/domain'\n`],
  ])('rejects %s depending on a feature', async (filePath, code) => {
    expect(await lint(filePath, code)).toContain(RULE)
  })

  it('allows a view to compose a feature', async () => {
    const rules = await lint(
      'src/views/TimerHomeView.vue',
      sfc(`import { x } from '@/features/timer/domain'\nvoid x`),
    )
    expect(rules).not.toContain(RULE)
  })
})

describe('db encapsulation', () => {
  it.each([
    'src/features/timer/domain.ts',
    'src/components/AppShell.vue',
    'src/state/thing.ts',
    'src/views/SettingsView.vue',
  ])('rejects %s reaching past @/db', async (filePath) => {
    const importLine = `import { listSessions } from '@/db/repositories/workouts'\nvoid listSessions`
    const code = filePath.endsWith('.vue') ? sfc(importLine) : `${importLine}\n`
    expect(await lint(filePath, code)).toContain(RULE)
  })

  it('rejects the schema as well as the repositories', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(`import { db } from '@/db/schema'\nvoid db`),
    )
    expect(rules).toContain(RULE)
  })

  it('allows the public surface', async () => {
    const rules = await lint(
      'src/features/timer/domain.ts',
      `export { listSessions } from '@/db'\n`,
    )
    expect(rules).not.toContain(RULE)
  })

  it('lets the migration spec reach the schema directly', async () => {
    const rules = await lint(
      'src/__tests__/unit/db/migrations.spec.ts',
      `export { db } from '@/db/schema'\n`,
    )
    expect(rules).not.toContain(RULE)
  })
})

/**
 * The same encapsulation argument as `db`, applied to the UI layer:
 * `src/components/ui/*` wraps reka-ui in our own primitives, and the rest of
 * the app talks to the wrappers. See docs/ui-components.md.
 */
describe('ui encapsulation', () => {
  it.each([
    'src/views/SettingsView.vue',
    'src/components/AppShell.vue',
    'src/features/timer/components/ModeCard.vue',
  ])('rejects %s importing reka-ui directly', async (filePath) => {
    const rules = await lint(filePath, sfc(`import { DialogRoot } from 'reka-ui'\nvoid DialogRoot`))
    expect(rules).toContain(RULE)
  })

  it('rejects cva outside the primitives', async () => {
    const rules = await lint(
      'src/features/timer/components/ModeCard.vue',
      sfc(`import { cva } from 'class-variance-authority'\nvoid cva`),
    )
    expect(rules).toContain(RULE)
  })

  it('rejects reaching past a primitive barrel', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(`import Button from '@/components/ui/button/Button.vue'\nvoid Button`),
    )
    expect(rules).toContain(RULE)
  })

  it('allows the barrel', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(`import { Button } from '@/components/ui/button'\nvoid Button`),
    )
    expect(rules).not.toContain(RULE)
  })

  it('lets a primitive use reka-ui and cva — that is what the layer is for', async () => {
    const rules = await lint(
      'src/components/ui/dialog/DialogTitle.vue',
      sfc(`import { DialogTitle } from 'reka-ui'\nvoid DialogTitle`),
    )
    expect(rules).not.toContain(RULE)
  })

  it('keeps a primitive out of the data layer', async () => {
    const rules = await lint(
      'src/components/ui/dialog/DialogContent.vue',
      sfc(`import { listSessions } from '@/db'\nvoid listSessions`),
    )
    expect(rules).toContain(RULE)
  })

  it('keeps a primitive out of app state', async () => {
    const rules = await lint(
      'src/components/ui/dialog/DialogContent.vue',
      sfc(`import { toastsAtom } from '@/state/toast'\nvoid toastsAtom`),
    )
    expect(rules).toContain(RULE)
  })

  /**
   * The one re-include in NO_APP_STATE, and the reason it is asserted rather
   * than assumed: gitignore's parent-directory rule silently kills a `!`
   * pattern under a `**` exclusion, so this test is what says the exception is
   * still live. A coarse pointer is the browser's state, not the app's.
   */
  it('still lets a primitive read browser capabilities', async () => {
    const rules = await lint(
      'src/components/ui/dialog/DialogContent.vue',
      sfc(`import { touchDeviceAtom } from '@/state/browser'\nvoid touchDeviceAtom`),
    )
    expect(rules).not.toContain(RULE)
  })
})

/**
 * The composable ban, which is a syntax rule rather than an import one — so it
 * needs its own rule id here, and its own deliberate violation.
 *
 * `src/__tests__/architecture/atomPlacement.test.ts` asserts the same thing by
 * reading the real tree. This is the other half of the pair: that the
 * enforcement actually fires, on a `.vue` file as well as a `.ts` one.
 */
describe('no composable layer', () => {
  const SYNTAX = 'no-restricted-syntax'

  it.each([
    ['src/state/theme.ts', 'export function useTheme() {\n  return {}\n}\n'],
    ['src/state/theme.ts', 'export const useTheme = () => ({})\n'],
    ['src/features/timer/wakeLock.ts', 'export function useWakeLock(): void {}\n'],
  ])('rejects a composable exported from %s', async (filePath, code) => {
    expect(await lint(filePath, code)).toContain(SYNTAX)
  })

  it('rejects one inside a component too', async () => {
    const rules = await lint(
      'src/components/AppShell.vue',
      sfc('export function useNav() {\n  return {}\n}'),
    )
    expect(rules).toContain(SYNTAX)
  })

  it('leaves the UI substrate alone', async () => {
    const rules = await lint(
      'src/components/ui/dialog/DialogContent.vue',
      sfc('export function useForwarded() {\n  return {}\n}'),
    )
    expect(rules).not.toContain(SYNTAX)
  })

  it('does not flag a local function that merely starts with "use"', async () => {
    const rules = await lint(
      'src/views/PresetsView.vue',
      sfc('function usePreset(id: string): void {\n  void id\n}\nusePreset("x")'),
    )
    expect(rules).not.toContain(SYNTAX)
  })
})
