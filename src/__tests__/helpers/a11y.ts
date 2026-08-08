import axe from 'axe-core'
import { expect, vi } from 'vitest'
import type { AppScreen } from '../pages/appScreen'

/**
 * Page-level rules axe only evaluates when the context is the whole
 * document. Scope axe to a mounted container and every one of these is
 * reported "inapplicable" — silently skipped, not passed.
 *
 * Deliberately absent: `html-has-lang`, `html-lang-valid` and
 * `document-title`. In this tier they would grade the Vitest browser
 * runner's own page (`<title>Vitest Browser Tester</title>`), not ours. The
 * shipped index.html is checked in the e2e tier, which loads it for real.
 */
const PAGE_LEVEL_RULES = [
  'bypass',
  'landmark-banner-is-top-level',
  'landmark-complementary-is-top-level',
  'landmark-contentinfo-is-top-level',
  'landmark-main-is-top-level',
  'landmark-no-duplicate-banner',
  'landmark-no-duplicate-contentinfo',
  'landmark-no-duplicate-main',
  'landmark-one-main',
  'landmark-unique',
  'page-has-heading-one',
  'region',
]

function report(results: axe.AxeResults) {
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target),
  }))
}

/**
 * Runs axe-core against an element and fails with a readable list of
 * violations (rule id + offending selectors) instead of a generic diff.
 */
export const assertNoViolations = vi.defineHelper(async (context: Element): Promise<void> => {
  const results = await axe.run(context, { resultTypes: ['violations'] })
  expect(report(results)).toEqual([])
})

/**
 * Runs the document-scoped rules — landmark structure, heading order,
 * skip links, unlabelled content outside any landmark. These are the ones
 * `assertNoViolations` cannot reach, and they only mean anything with the
 * app mounted, so call it after rendering a screen.
 */
export const assertNoPageLevelViolations = vi.defineHelper(
  async (mounted: AppScreen): Promise<void> => {
    expect(mounted.container.isConnected).toBe(true)
    const results = await axe.run(document, {
      resultTypes: ['violations'],
      runOnly: PAGE_LEVEL_RULES,
    })
    expect(report(results)).toEqual([])
  },
)
