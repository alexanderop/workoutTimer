import { afterEach, describe, expect, it } from 'vitest'
import { env } from '@/__tests__/helpers/env'

/**
 * `innerText` — the only text property that answers "what does the user read"
 * rather than "what is in the markup". It excludes what is not displayed,
 * collapses whitespace the way the box tree does, and turns line breaks into
 * newlines.
 *
 * It cannot exist without layout, and jsdom does not have it: the IDL line is
 * commented out, and there is no descriptor on `HTMLElement.prototype`. So the
 * `jsdom` column below is `undefined` all the way down — that uniformity is the
 * finding, not a gap in the spec.
 *
 * The write path is the purest silent failure in this tier. Assigning to a
 * property that does not exist is not an error in JavaScript; it creates an own
 * property on the element object. The assignment appears to work, the element
 * is unchanged, and nothing reports it: no throw, no console warning, not even
 * a jsdomError. A test that sets `innerText` and then asserts on it passes
 * while the DOM never changed.
 *
 * The distinction matters for any screen that hides content responsively or by
 * state — a `md:hidden` label, a collapsed section, a `v-show` panel. Asserting
 * on `textContent` there asserts the union of what is on screen and what is
 * deliberately not, which is why such a test keeps passing after the thing it
 * describes stops being visible.
 */
const expected = {
  jsdom: {
    hasDescriptor: false,
    visibleText: undefined,
    collapsedWhitespace: undefined,
    lineBreak: undefined,
    writeReachesDocument: false,
  },
  browser: {
    hasDescriptor: true,
    visibleText: 'Visible',
    collapsedWhitespace: 'Rest 90 seconds',
    lineBreak: 'Round 1\nRound 2',
    writeReachesDocument: true,
  },
}[env]

/** `innerText` is absent from the type in neither environment, but from the DOM in one. */
function innerTextOf(element: HTMLElement): string | undefined {
  return (element as { innerText?: string }).innerText
}

afterEach(() => {
  document.body.replaceChildren()
})

function render(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  return container
}

describe('whether innerText exists at all', () => {
  it('has a descriptor on the prototype, or has none', () => {
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText') !== undefined).toBe(
      expected.hasDescriptor,
    )
  })
})

describe('innerText reports only what is rendered', () => {
  it('excludes a hidden element that textContent still reports', () => {
    const container = render(`
      <span>Visible</span>
      <span style="display: none">Hidden</span>
    `)

    expect(
      container.textContent,
      'textContent should carry the hidden span — if it does not, this comparison proves nothing',
    ).toContain('Hidden')

    expect(
      innerTextOf(container)?.trim(),
      'innerText is defined against the rendered box tree, so a display:none subtree drops out of it — unless there is no box tree, in which case there is no innerText either and every "what does the screen say" assertion has to be written against textContent, which says what the screen does not.',
    ).toBe(expected.visibleText)
  })

  it('collapses markup whitespace the way the box tree does', () => {
    const container = render(`<p>Rest     90


      seconds</p>`)

    // textContent preserves the source bytes; innerText reports the single
    // spaces that were actually laid out.
    expect(container.textContent).toMatch(/ {4}/)
    expect(innerTextOf(container)).toBe(expected.collapsedWhitespace)
  })

  it('turns a line break element into an actual newline', () => {
    const container = render(`<p>Round 1<br>Round 2</p>`)

    expect(container.textContent).toBe('Round 1Round 2')
    expect(
      innerTextOf(container),
      'without layout there is no line box to break, so the two rounds run together — or rather, there is nothing to run together at all',
    ).toBe(expected.lineBreak)
  })
})

describe('writing to innerText', () => {
  it('changes the document, or is absorbed by the JavaScript object', () => {
    const container = render(`<p>Rest 90 seconds</p>`)
    const paragraph = container.querySelector('p')!
    ;(paragraph as { innerText?: string }).innerText = 'Rest 60 seconds'

    expect(
      !Object.hasOwn(paragraph, 'innerText'),
      'an own property here means the assignment never reached the DOM. Reading it back returns what you wrote, so the test passes and the document is untouched.',
    ).toBe(expected.writeReachesDocument)

    expect(paragraph.textContent).toBe(
      expected.writeReachesDocument ? 'Rest 60 seconds' : 'Rest 90 seconds',
    )
  })
})
