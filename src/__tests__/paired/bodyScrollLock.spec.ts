import { afterEach, describe, expect, it } from 'vitest'
import { env } from '@/__tests__/helpers/env'

/**
 * The scroll lock behind every dialog and bottom sheet in this app.
 *
 * Reka's `useBodyScrollLock` measures the scrollbar the standard way
 * (`node_modules/reka-ui/dist/shared/useBodyScrollLock.js:33`):
 *
 *     const verticalScrollbarWidth =
 *       window.innerWidth - document.documentElement.clientWidth
 *
 *     if (verticalScrollbarWidth > 0) {
 *       document.body.style.paddingRight = `${config.padding}px`
 *       document.body.style.overflow = 'hidden'   // ← the actual lock
 *     }
 *
 * In jsdom `innerWidth` is 1024 and `documentElement.clientWidth` is 0, because
 * there is no layout. So the width computes to 1024 — the entire viewport,
 * a number no device has ever reported — the branch is always taken, and the
 * lock is always applied.
 *
 * On iOS and on macOS with overlay scrollbars the real number is 0, the branch
 * is skipped, and `overflow: hidden` is never set. That is the single most
 * reported mobile modal bug — the page scrolling behind an open sheet — and
 * the jsdom test for it passes for a reason that does not exist on any device.
 */
const CONFIG_PADDING = 15

const expected = {
  jsdom: { documentHasWidth: false, scrollbarIsWholeViewport: true },
  browser: { documentHasWidth: true, scrollbarIsWholeViewport: false },
}[env]

/** The measurement, lifted verbatim from Reka. */
function verticalScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth
}

afterEach(() => {
  document.body.style.removeProperty('overflow')
  document.body.style.removeProperty('padding-right')
})

describe('the measurement the scroll lock branches on', () => {
  it('has a laid-out document to measure against', () => {
    expect(window.innerWidth).toBeGreaterThan(0)

    expect(
      document.documentElement.clientWidth > 0,
      'the document element has no width, so the subtraction below is `innerWidth - 0` and can only ever return the whole viewport',
    ).toBe(expected.documentHasWidth)
  })

  it('computes a scrollbar width a device could actually report', () => {
    const width = verticalScrollbarWidth()

    expect(
      width === window.innerWidth,
      `the measured gutter is ${width}px against a ${window.innerWidth}px viewport. A scrollbar as wide as the window is not a value any browser produces — but it is greater than zero, which is the only thing the branch asks.`,
    ).toBe(expected.scrollbarIsWholeViewport)
  })
})

describe('what that does to the lock', () => {
  it('takes the branch whenever the measurement is positive', () => {
    // Reka's body, reduced to the branch.
    if (verticalScrollbarWidth() > 0) {
      document.body.style.paddingRight = `${CONFIG_PADDING}px`
      document.body.style.overflow = 'hidden'
    }

    // This is the test everyone writes for "opening the sheet locks the page".
    // Where the measurement can only be positive it would also pass if the
    // condition were `> -1`, or `true` — because the environment can never
    // produce the 0 that makes the branch interesting.
    const locked = document.body.style.overflow === 'hidden'
    expect(locked).toBe(verticalScrollbarWidth() > 0)
  })

  it('skips the lock entirely once the measurement is honest', () => {
    // What a phone reports: no classic scrollbar, so no gutter to compensate.
    // Pure arithmetic, and it comes out the same in both environments — which
    // is the point. The branch is not subtle. Reaching the input that exercises
    // it is the part that needs a browser.
    const overlayScrollbarWidth = 0

    if (overlayScrollbarWidth > 0) {
      document.body.style.overflow = 'hidden'
    }

    expect(
      document.body.style.overflow,
      'nothing was locked. The background scrolls behind the open sheet, and no assertion written against a simulated viewport can reach this state.',
    ).toBe('')
  })
})
