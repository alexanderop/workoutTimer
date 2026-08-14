import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { Button } from '@/components/ui/button'
import { browserOnly, env } from '@/__tests__/helpers/env'
import '@/style.css'

/**
 * The rule under test is a global `user-select: none` on `body` — app chrome is
 * not quotable text — paired with an exemption that ships in the same commit,
 * always:
 *
 *     input, textarea, [contenteditable='true'] { user-select: text }
 *
 * Without the exemption, iOS refuses caret placement inside text fields. It
 * presents as a broken keyboard rather than as a CSS bug, and it reproduces on
 * no desktop browser. That is the assertion carrying the weight, and it is the
 * one jsdom cannot express at any strength.
 *
 * Three elements, three different values from the stylesheet: `none` inherited
 * from the body rule, `text` from `select-text`, `text` from the exemption.
 * jsdom returns the initial value for all three, so **the exemption and its
 * absence are the same document**. Delete those four lines from
 * `src/style.css` and the jsdom column below still passes; the browser column
 * fails with `expected 'none' to be 'text'`.
 *
 * `src/__tests__/components/textSelection.spec.ts` is the gate that runs this
 * against real screens through the app's own fixtures. This file is the
 * controlled version of it, so both runners answer the same question.
 */
const PROSE = 'some prose the user wrote'

const expected = {
  jsdom: { chrome: 'auto', prose: 'auto', field: 'auto' },
  browser: { chrome: 'none', prose: 'text', field: 'text' },
}[env]

const mounted: Array<() => void> = []

// Mounted by hand: @testing-library/vue reads `process` at import time, which
// does not exist in the browser tier, so a shared spec cannot use it.
function renderScreen(): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)

  const app = createApp({
    render: () =>
      h('div', [
        h(Button, {}, () => 'Timer'),
        h('p', { class: 'select-text' }, PROSE),
        h('textarea', { 'aria-label': 'Workout description' }),
      ]),
  })
  app.mount(host)

  mounted.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

function selectedText(): string {
  return window.getSelection()?.toString().trim() ?? ''
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount()
  window.getSelection()?.removeAllRanges()
})

describe('the stylesheet gives chrome, prose and fields three different answers', () => {
  it('computes user-select on each of them', () => {
    const host = renderScreen()

    expect(
      document.styleSheets.length,
      'the stylesheet is not loaded, so this file proves nothing',
    ).toBeGreaterThan(0)

    const chrome = host.querySelector('button')!
    const prose = host.querySelector('p')!
    const field = host.querySelector('textarea')!

    expect(getComputedStyle(chrome).userSelect).toBe(expected.chrome)
    expect(getComputedStyle(prose).userSelect).toBe(expected.prose)
    expect(
      getComputedStyle(field).userSelect,
      'this is the declaration that would fail on iOS. Where all three elements report the same value, deleting the input/textarea exemption changes nothing that any assertion can see.',
    ).toBe(expected.field)
  })
})

describe('what a double-click actually selects', () => {
  /**
   * These two pass in jsdom as well, and it is worth knowing why they are not
   * shared: neither environment consults `user-select` to answer them. Chromium
   * does not let a double-click select button text regardless, and
   * `@testing-library/user-event` decides what a double-click selects from the
   * tag name. Same answer, no shared reason — and under jsdom, no reason
   * connected to the CSS at all. Asserting them there records agreement that
   * does not mean anything.
   */
  browserOnly('selects nothing when chrome is double-clicked', async () => {
    const host = renderScreen()

    await userEvent.dblClick(host.querySelector('button')!)

    expect(
      selectedText(),
      'a tab label is a control, not quotable text — selecting it intercepts the long-press a native app spends on a context menu',
    ).toBe('')
  })

  browserOnly('still selects the user’s own prose', async () => {
    const host = renderScreen()

    await userEvent.dblClick(host.querySelector('p')!)

    expect(
      selectedText(),
      'workout notes are prose the user wrote and may want to copy. Whatever renders user-authored text opts back in with `select-text`.',
    ).not.toBe('')
  })

  browserOnly('still lets a text field be selected into', async () => {
    const host = renderScreen()
    const field = host.querySelector('textarea')!

    await userEvent.fill(field, 'a note worth keeping')
    await userEvent.dblClick(field)

    expect(field.selectionEnd).toBeGreaterThan(field.selectionStart)
  })
})
