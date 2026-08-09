import { describe, expect, it } from 'vitest'

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
 * there is no layout. So the width computes to 1024, the branch is always
 * taken, and the lock is always applied.
 *
 * On iOS and on macOS with overlay scrollbars the real number is 0, the branch
 * is skipped, and `overflow: hidden` is never set. That is the single most
 * reported mobile modal bug — the page scrolling behind an open sheet — and
 * the jsdom test for it passes for a reason that does not exist on any device.
 */
const CONFIG_PADDING = 15

/** The measurement, lifted verbatim from Reka. */
function verticalScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth
}

describe('the measurement the scroll lock branches on', () => {
  it('has no layout to measure, so the viewport is 1024 wide and the document is 0', () => {
    expect(window.innerWidth).toBe(1024)
    expect(document.documentElement.clientWidth).toBe(0)
    expect(document.body.clientWidth).toBe(0)
  })

  it('computes a 1024px scrollbar', () => {
    expect(verticalScrollbarWidth()).toBe(1024)
  })
})

describe('what that does to the lock', () => {
  it('always takes the branch, so the obvious assertion is green', () => {
    // Reka's body, reduced to the branch.
    if (verticalScrollbarWidth() > 0) {
      document.body.style.paddingRight = `${CONFIG_PADDING}px`
      document.body.style.overflow = 'hidden'
    }

    // This is the test everyone writes for "opening the sheet locks the page",
    // and it passes. It would also pass if the condition were `> -1`, or
    // `true`, because jsdom can never produce the 0 that makes it interesting.
    expect(document.body.style.overflow).toBe('hidden')

    document.body.style.removeProperty('overflow')
    document.body.style.removeProperty('padding-right')
  })

  it('skips the lock entirely once the measurement is honest', () => {
    // What a phone reports: no classic scrollbar, so no gutter to compensate.
    const overlayScrollbarWidth = 0

    if (overlayScrollbarWidth > 0) {
      document.body.style.overflow = 'hidden'
    }

    // Nothing was locked. The background scrolls behind the open sheet, and no
    // jsdom test can reach this state — the browser tier is where the real
    // `innerWidth - clientWidth` is available to be 0.
    expect(document.body.style.overflow).toBe('')
  })
})
