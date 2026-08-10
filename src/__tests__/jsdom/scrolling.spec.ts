import { afterEach, describe, expect, it } from 'vitest'

/**
 * Counterpart to `src/__tests__/components/scrolling.spec.ts`.
 *
 * `platformApis.spec.ts` shows that `scrollIntoView` is missing and that
 * stubbing it converts a behaviour test into a call-signature test. This file
 * is about the property you reach for *instead* once you have stubbed it —
 * `scrollTop` — which is worse, because it is present and writable.
 *
 * jsdom declares `scrollTop` as a plain data field in the Element constructor
 * (`this.scrollTop = 0`) with no getter, no setter, and no clamping. Whatever
 * you assign is what you read back. In a browser `scrollTop` is clamped to
 * `scrollHeight - clientHeight`, which for a non-scrolling element is `0`.
 *
 * So a virtualised-list test writes 5000, reads 5000, computes a window of rows
 * from it, and passes — while the same code in a browser clamps to 0 and
 * renders the first row. This is not a test that fails to catch a bug; it is a
 * test that manufactures confidence.
 */
function scroller(): HTMLElement {
  const element = document.createElement('div')
  element.style.overflowY = 'auto'
  element.style.height = '100px'
  for (let index = 0; index < 50; index += 1) {
    const row = document.createElement('p')
    row.textContent = `row ${index}`
    element.append(row)
  }
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('scrollTop is a field, not a scroll position', () => {
  it('stores a value far past the end of a container with no extent', () => {
    const element = scroller()

    element.scrollTop = 5000

    // The three numbers are mutually impossible: you cannot be scrolled 5000px
    // down something whose scrollable extent is zero. A browser clamps to
    // `scrollHeight - clientHeight`, which here is 0.
    expect(element.scrollTop).toBe(5000)
    expect(element.scrollHeight).toBe(0)
    expect(element.clientHeight).toBe(0)
  })

  it('accepts a negative offset', () => {
    const element = scroller()

    element.scrollTop = -5

    expect(element.scrollTop).toBe(-5)
  })

  it('never fires a scroll event of its own', async () => {
    const element = scroller()
    let events = 0
    element.addEventListener('scroll', () => (events += 1))
    document.addEventListener('scroll', () => (events += 1))

    element.scrollTop = 400
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Any `scroll` handler under test only ever runs because the test itself
    // dispatched one. The assertion "scrolling loads the next page" is really
    // "calling my handler calls my handler".
    expect(events).toBe(0)
  })
})
