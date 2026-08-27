/**
 * Architecture tests using ArchUnitTS. These are the codified versions of
 * the conventions in docs/index.md:
 *
 * 1. No circular dependencies inside any layer.
 * 2. Features never import from other features.
 * 3. Shared layers (components, state, db, lib, types) never depend on
 *    features or views.
 * 4. The database is only reached through its public surface (src/db/index)
 *    — nobody imports the repositories directly.
 *
 * Note: ArchUnitTS analyzes TypeScript imports. <script setup> blocks in
 * .vue files are not parsed, so keep feature logic in .ts modules (where it
 * belongs anyway — that is what makes it unit-testable).
 *
 * That blind spot, and the fact that these rules all assert the *absence* of
 * a violation, is why boundaries.test.ts exists next to this file: it feeds
 * ESLint deliberate violations — .vue included — and asserts they are caught.
 * Read the two together; neither is sufficient alone.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectFiles } from 'archunit'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../../', import.meta.url))

const FEATURES = readdirSync(new URL('../../features/', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const SHARED_FOLDERS = ['components', 'state', 'db', 'lib', 'types'] as const

describe('circular dependencies', () => {
  for (const folder of ['features', 'components', 'state', 'db'] as const) {
    it(`${folder} should be free of cycles`, async () => {
      const rule = projectFiles().inFolder(`src/${folder}/**`).should().haveNoCycles()
      await expect(rule).toPassAsync()
    })
  }
})

/**
 * Feature isolation, asserted directly rather than through a rule per *pair*
 * of features.
 *
 * The pair loop was the shape this had, and with one feature checked in it
 * built zero rules: the only line that called an assertion never executed, and
 * the test reported green in 0 ms. The timing was the tell — every scanning
 * rule here costs at least a millisecond. So this walks the feature's own
 * files and resolves every import instead, which asserts something with one
 * feature in the tree and keeps asserting it with five. It also sees `.vue`,
 * which ArchUnitTS does not parse at all.
 */
const IMPORT_SPECIFIER =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

/** Where an import specifier points, as a `src/`-relative path, or undefined. */
export function resolveImport(fromFile: string, specifier: string): string | undefined {
  if (specifier.startsWith('@/')) return specifier.slice(2)
  if (!specifier.startsWith('.')) return undefined
  return relative(SRC, resolve(dirname(fromFile), specifier))
}

/**
 * Lines that are prose. The house rule for a text-level check is that a
 * comment about a rule cannot trip it, and a doc comment naming
 * `@/features/other/thing` to explain why nothing may import it is exactly the
 * sentence someone will write.
 */
const isComment = (line: string): boolean => /^\s*(?:\/\/|\*|\/\*)/.test(line)

/** Imports in `feature`'s files that reach into a different feature. */
export function crossFeatureImports(feature: string, files: ReadonlyArray<string>): string[] {
  const mine = `features/${feature}/`

  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !isComment(line))
      .join('\n')
    return [...source.matchAll(IMPORT_SPECIFIER)]
      .map((match) => resolveImport(file, match[1] ?? match[2] ?? ''))
      .filter(
        (target): target is string =>
          target !== undefined && target.startsWith('features/') && !target.startsWith(mine),
      )
      .map((target) => `${relative(SRC, file)} → ${target}`)
  })
}

describe('feature isolation', () => {
  it('finds features to check', () => {
    expect(FEATURES.length).toBeGreaterThan(0)
  })

  it.each(FEATURES)('%s imports nothing from another feature', (feature) => {
    const files = sourceFiles(join(SRC, 'features', feature))

    // A guard against the rule passing because it read no files at all — the
    // failure mode this whole block exists to correct.
    expect(files.length).toBeGreaterThan(0)
    expect(
      crossFeatureImports(feature, files),
      `src/features/${feature} reaches into another feature. Features compose in views and in the app shell, not in each other — move the shared part down into src/lib, src/state or src/components. docs/index.md`,
    ).toEqual([])
  })

  it('catches the import it is looking for', () => {
    const inTimer = join(SRC, 'features/timer/domain.ts')

    expect(resolveImport(inTimer, '@/features/other/thing')).toBe('features/other/thing')
    expect(resolveImport(inTimer, '../other/thing')).toBe('features/other/thing')
    expect(resolveImport(inTimer, './pickerOptions')).toBe('features/timer/pickerOptions')
    expect(resolveImport(inTimer, 'effect')).toBeUndefined()
  })

  it('leaves prose about the rule alone', () => {
    expect(isComment(`import { thing } from '@/features/other/thing'`)).toBe(false)
    expect(isComment(`  // import { thing } from '@/features/other/thing'`)).toBe(true)
    expect(isComment(` * a feature never imports '@/features/other/thing'`)).toBe(true)
  })

  /**
   * ArchUnitTS still owns the pair rules — it resolves the module graph rather
   * than reading text, so it sees a re-export chain the scan above would miss.
   * With one feature this loop is empty, which is the state that made the old
   * version of this block assert nothing; it is a *supplement* here, not the
   * rule.
   */
  const pairs = FEATURES.flatMap((feature) =>
    FEATURES.filter((other) => other !== feature).map((other) => [feature, other] as const),
  )

  it.each(pairs)('%s should not depend on %s (module graph)', async (feature, other) => {
    const rule = projectFiles()
      .inFolder(`src/features/${feature}/**`)
      .shouldNot()
      .dependOnFiles()
      .inFolder(`src/features/${other}/**`)
    await expect(rule).toPassAsync()
  })
})

describe('layer dependencies', () => {
  // No "should not depend on views" rules here: views are pure .vue files,
  // which ArchUnitTS does not parse, so those rules would match zero files
  // and fail as empty. The import direction into views is enforced by the
  // feature/shared rules above covering everything views could re-export.
  for (const folder of SHARED_FOLDERS) {
    it(`${folder} should not depend on features`, async () => {
      const rule = projectFiles()
        .inFolder(`src/${folder}/**`)
        .shouldNot()
        .dependOnFiles()
        .inFolder('src/features/**')
      await expect(rule).toPassAsync()
    })
  }
})

describe('db encapsulation', () => {
  for (const folder of ['features', 'components', 'state'] as const) {
    it(`${folder} should not import db repositories directly`, async () => {
      const rule = projectFiles()
        .inFolder(`src/${folder}/**`)
        .shouldNot()
        .dependOnFiles()
        .inFolder('src/db/repositories/**')
      await expect(rule).toPassAsync()
    })
  }
})
