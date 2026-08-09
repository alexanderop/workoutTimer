import { render } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { Button } from '@/components/ui/button'
import '@/style.css'

/**
 * Counterpart to `src/__tests__/components/textSelection.spec.ts`.
 *
 * The rule under test is a global `user-select: none` on `body` — app chrome
 * is not quotable text — paired with an exemption that ships in the same
 * commit, always:
 *
 *     input, textarea, [contenteditable='true'] { user-select: text }
 *
 * Without the exemption, iOS refuses caret placement inside text fields. It
 * presents as a broken keyboard rather than as a CSS bug, and it reproduces on
 * no desktop browser. That is the assertion carrying the weight, and it is the
 * one jsdom cannot express at any strength.
 *
 * Everything below passes. Deleting the exemption from `src/style.css` leaves
 * it passing; the browser spec fails with `expected 'none' to be 'text'`.
 */
const PROSE = 'some prose the user wrote'

function renderScreen() {
  return render({
    render: () =>
      h('div', [
        h(Button, {}, () => 'Timer'),
        h('p', { class: 'select-text' }, PROSE),
        h('textarea', { 'aria-label': 'Workout description' }),
      ]),
  })
}

function selectedText(): string {
  return window.getSelection()?.toString().trim() ?? ''
}

function clearSelection(): void {
  window.getSelection()?.removeAllRanges()
}

describe('the two assertions that survive the translation', () => {
  // These pass in jsdom, and they pass in the browser. Worth knowing why:
  // neither environment is consulting `user-select` here. Chromium does not
  // let a double-click select button text regardless, and `user-event` decides
  // what a double-click selects from the tag name. Same answer, no shared
  // reason — and in jsdom, no reason connected to the CSS at all.
  it('selects nothing when chrome is double-clicked', async () => {
    const { getByRole } = renderScreen()
    clearSelection()

    await userEvent.dblClick(getByRole('button', { name: 'Timer' }))

    expect(selectedText()).toBe('')
  })

  it('still selects the user’s own prose', async () => {
    const { getByText } = renderScreen()
    clearSelection()

    await userEvent.dblClick(getByText(PROSE))

    expect(selectedText()).not.toBe('')
  })
})

describe('the assertion that does not survive it', () => {
  it('reports the same user-select for chrome, prose and text fields', () => {
    const { getByRole, getByText, getByLabelText } = renderScreen()

    expect(
      document.styleSheets.length,
      'the stylesheet is not loaded, so this file proves nothing',
    ).toBeGreaterThan(0)

    // Three elements the stylesheet gives three different values: `none` from
    // the body rule, `text` from `select-text`, `text` from the exemption.
    // jsdom returns the initial value for all three, so the exemption and its
    // absence are the same document.
    expect(getComputedStyle(getByRole('button', { name: 'Timer' })).userSelect).toBe('auto')
    expect(getComputedStyle(getByText(PROSE)).userSelect).toBe('auto')
    expect(getComputedStyle(getByLabelText('Workout description')).userSelect).toBe('auto')
  })

  it('places a caret in the field whether or not the exemption exists', async () => {
    const { getByLabelText } = renderScreen()
    const field = getByLabelText('Workout description') as HTMLTextAreaElement

    await userEvent.type(field, 'a note worth keeping')
    await userEvent.dblClick(field)

    // The browser spec asserts `selectionEnd > selectionStart` here *and* then
    // asserts the declaration behind it, because desktop Chromium places a
    // caret regardless — the declaration is the half that would fail on iOS.
    // jsdom offers only the half that cannot fail.
    expect(field.selectionEnd).toBeGreaterThan(field.selectionStart)
  })
})

describe('why the stylesheet cannot help', () => {
  it('is parsed in full and then applied to nothing', () => {
    const sheet = document.styleSheets[0]!
    let rules = 0
    let layers = 0

    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        rules += 1
        if (rule.constructor.name.includes('Layer')) layers += 1
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) walk(nested)
      }
    }
    walk(sheet.cssRules)

    // Tailwind v4 emits its utilities and the project's base rules inside
    // `@layer`. jsdom parses the layers — they are right there in the CSSOM —
    // but its cascade does not implement `@layer`, so no rule inside one is
    // ever applied. The CSS is present, understood, and ignored.
    expect(rules).toBeGreaterThan(100)
    expect(layers).toBeGreaterThan(0)
  })
})
