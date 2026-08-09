import { describe, expect } from 'vitest'
import { it } from '../fixtures'

/**
 * `body` carries `overscroll-behavior-y: none` (src/style.css), and that rule
 * is correct as an outer guard — but `body` never scrolls. The shell is an
 * `h-dvh` flex column whose inner containers own scrolling, so a declaration
 * on `body` stops nothing: reaching the end of a list chains the gesture
 * outward to the page behind it, which is the single most common "this is a
 * website" tell on a phone.
 *
 * The bug was therefore *a correct declaration on an element that never
 * scrolls*, and a test naming `<main>` would miss the next instance of it.
 * Ask the DOM which elements actually scroll, then hold those to the rule.
 */
function scrollContainers(root: Element): Array<HTMLElement> {
  return [root, ...root.querySelectorAll('*')].filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false
    const { overflowY } = getComputedStyle(element)
    return overflowY === 'auto' || overflowY === 'scroll'
  })
}

describe('the shell contains its overscroll', () => {
  it('sets overscroll-behavior-y on every element that scrolls', async ({ timer }) => {
    await timer.expectHome()

    const containers = scrollContainers(timer.container)

    // Without this the test would pass on a shell that has no scroller at all.
    // A green check means nothing until you know what would turn it red.
    expect(containers.length, 'no scroll container found — the query is wrong').toBeGreaterThan(0)

    for (const container of containers) {
      expect(
        getComputedStyle(container).overscrollBehaviorY,
        `<${container.tagName.toLowerCase()} class="${container.className}"> scrolls but lets the gesture chain to the page behind it. Add \`overscroll-contain\` — \`contain\` rather than \`none\`, since rubber-banding belongs to the element that legitimately scrolls.`,
      ).toBe('contain')
    }
  })
})
