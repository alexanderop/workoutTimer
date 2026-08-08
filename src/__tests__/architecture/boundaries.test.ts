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
    ['src/composables/useThing.ts', `export { x } from '@/features/timer/domain'\n`],
    ['src/stores/thing.ts', `export { x } from '@/features/timer/domain'\n`],
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
    'src/composables/useThing.ts',
    'src/stores/thing.ts',
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
      'src/__tests__/db/migration.spec.ts',
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
      sfc(`import { useToastStore } from '@/stores/toast'\nvoid useToastStore`),
    )
    expect(rules).toContain(RULE)
  })

  it('still lets a primitive use a composable', async () => {
    const rules = await lint(
      'src/components/ui/dialog/DialogContent.vue',
      sfc(`import { useTouchDevice } from '@/composables/useTouchDevice'\nvoid useTouchDevice`),
    )
    expect(rules).not.toContain(RULE)
  })
})
