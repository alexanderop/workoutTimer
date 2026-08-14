import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { env } from '@/__tests__/helpers/env'

/**
 * The one that should worry a reader most, because nothing about it looks
 * environment-dependent. axe-core runs in jsdom. The helper is unchanged. The
 * suite is green. And the screen below is grey text on a grey background with a
 * 12px tap target.
 *
 * axe does not report a false pass — it is more careful than that. It reports
 * `color-contrast` as *incomplete*: compositing the rendered colours needs
 * canvas, and jsdom has none (running this prints "Not implemented:
 * HTMLCanvasElement's getContext()"). The trouble is that `incomplete` is a
 * third bucket, and the standard helper — ours included — only ever reads
 * `results.violations`. **A rule that could not run is indistinguishable from a
 * rule that passed**, and the distinction is exactly one property deep.
 *
 * `src/__tests__/a11y/a11y.spec.ts` is the gate that sweeps real screens. This
 * is the controlled version, on a screen built to fail, so both runners grade
 * the same thing.
 */
const UNREADABLE = 'Barely there'

const expected = {
  jsdom: {
    contrastInViolations: false,
    // Every node lands here, including the `<h1>`, because compositing needs
    // canvas and there is none.
    contrastInIncomplete: true,
    measuresTheButton: false,
  },
  browser: {
    // The `<h1>` is a hard violation: grey on grey, composited and graded.
    contrastInViolations: true,
    // The 12px button is *also* incomplete here — axe declines to grade text
    // it cannot lay out inside a box that small. So `incomplete` being
    // non-empty is not itself the finding; which bucket the readable-text
    // failure landed in is.
    contrastInIncomplete: true,
    measuresTheButton: true,
  },
}[env]

const mounted: Array<() => void> = []

// Mounted by hand: @testing-library/vue reads `process` at import time, which
// does not exist in the browser tier, so a shared spec cannot use it.
function renderUnreadableScreen(): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)

  const app = createApp({
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
  app.mount(host)

  mounted.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

const idsOf = (results: Array<{ id: string }>): Array<string> => results.map((result) => result.id)

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount()
})

describe('the sweep as the helper actually calls it', () => {
  it('reports a violation on a screen nobody can read', async () => {
    const host = renderUnreadableScreen()

    const results = await axe.run(host, { resultTypes: ['violations'] })

    // This is `assertNoViolations`, verbatim. One of these two environments
    // passes it on this screen.
    expect(
      idsOf(results.violations).includes('color-contrast'),
      'the helper reads `violations` and nothing else. Where the rule landed elsewhere, the screen above ships grey-on-grey with a green suite.',
    ).toBe(expected.contrastInViolations)
  })
})

describe('where the rule that mattered actually went', () => {
  it('sorts color-contrast into violations or into incomplete', async () => {
    const host = renderUnreadableScreen()

    const results = await axe.run(host, {})

    expect(idsOf(results.violations).includes('color-contrast')).toBe(expected.contrastInViolations)
    expect(
      idsOf(results.incomplete).includes('color-contrast'),
      '`incomplete` is the bucket for "this rule could not be evaluated here". It is not an error, it is not a violation, and no helper in this repo or any other reads it by default.',
    ).toBe(expected.contrastInIncomplete)
  })

  it('has geometry for a size rule to grade at all', async () => {
    const host = renderUnreadableScreen()
    const button = host.querySelector('button')!

    // Worth stating plainly, because it is the more alarming half: axe's
    // `target-size` rule reports a **pass** in both environments here. In
    // Chromium that is a defensible call — the rule exempts a small target
    // with enough spacing around it. In jsdom it is a 0×0 element passing a
    // rule about how big elements are.
    const results = await axe.run(host, { runOnly: { type: 'rule', values: ['target-size'] } })
    expect(idsOf(results.passes)).toContain('target-size')

    expect(
      button.getBoundingClientRect().height > 0,
      'this is what the size rule was grading. With no layout engine every box measures 0×0, so neither axe nor our own 44px floor has a number to compare — and a rule with nothing to measure reports success, not doubt.',
    ).toBe(expected.measuresTheButton)
  })
})
