import axe from 'axe-core'
import { render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'

/**
 * Counterpart to `src/__tests__/a11y/a11y.spec.ts`.
 *
 * This is the one that should worry a reader most, because nothing about it
 * looks environment-dependent. axe-core runs in jsdom, the helper is
 * unchanged, the suite is green — and the screen below is grey text on a grey
 * background with a 12px tap target.
 *
 * axe does not report a false pass. It reports `color-contrast` as
 * *incomplete*: it needs to composite the rendered colours, that needs canvas,
 * and jsdom has no canvas (running this prints "Not implemented:
 * HTMLCanvasElement's getContext()"). The trouble is that `incomplete` is a
 * third bucket, and the standard helper — ours included — only ever reads
 * `results.violations`. A rule that cannot run is silently indistinguishable
 * from a rule that passed.
 */
const UNREADABLE = 'Barely there'

function renderUnreadableScreen() {
  return render({
    render: () =>
      h('main', { style: 'background-color: #808080' }, [
        h('h1', { style: 'color: #7a7a7a; background-color: #808080' }, UNREADABLE),
        h(
          'button',
          { style: 'color: #858585; background-color: #808080; width: 12px; height: 12px' },
          'Go',
        ),
      ]),
  })
}

describe('the jsdom version of the a11y sweep', () => {
  it('reports no violations on a screen nobody can read', async () => {
    const { container } = renderUnreadableScreen()

    const results = await axe.run(container, { resultTypes: ['violations'] })

    // This is `assertNoViolations`, and it is green.
    expect(results.violations).toEqual([])
  })

  it('put the rule that mattered in a bucket the helper never reads', async () => {
    const { container } = renderUnreadableScreen()

    const results = await axe.run(container, {})

    expect(results.violations.map((violation) => violation.id)).not.toContain('color-contrast')
    expect(results.incomplete.map((violation) => violation.id)).toContain('color-contrast')
  })

  it('cannot run the rules that depend on being laid out', async () => {
    const { container } = renderUnreadableScreen()

    const results = await axe.run(container, {})
    const ran = [...results.violations, ...results.passes].map((violation) => violation.id)

    // `target-size` never even reaches the incomplete bucket: with every box
    // measuring 0×0 there is no geometry to grade, so the 12px button is not
    // assessed by axe here and is not assessed by our 44px floor either.
    expect(ran).not.toContain('target-size')
  })
})
