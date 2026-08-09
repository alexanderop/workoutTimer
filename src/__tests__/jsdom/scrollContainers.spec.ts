import { render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import '@/style.css'

/**
 * Counterpart to `src/__tests__/components/scrollContainers.spec.ts`.
 *
 * The browser spec asks the DOM which elements actually scroll, then holds
 * those to `overscroll-behavior-y: contain`. Asking the DOM is the whole idea:
 * naming `<main>` would miss the next scroller someone adds.
 *
 * In jsdom the question returns nothing. `overflow-y-auto` computes to
 * `visible`, so the filter matches zero elements, the `for` loop never runs,
 * and a spec that asserts only inside that loop is green on a shell with no
 * overscroll containment anywhere.
 *
 * The browser spec survives this by accident of good habit — it opens with
 * `expect(containers.length).toBeGreaterThan(0)`. That guard, written to stop
 * a vacuous pass, is the only line that would fail here. Both versions are
 * below.
 */
function scrollContainers(root: Element): Array<HTMLElement> {
  return [root, ...root.querySelectorAll('*')].filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false
    const { overflowY } = getComputedStyle(element)
    return overflowY === 'auto' || overflowY === 'scroll'
  })
}

function renderShell() {
  return render({
    render: () =>
      h('div', { class: 'flex h-dvh flex-col' }, [
        h('header', 'Timer'),
        // The real shell's scroller: an inner container that owns scrolling,
        // which is why `overscroll-behavior-y` on `body` stops nothing.
        h('main', { class: 'flex-1 overflow-y-auto overscroll-contain' }, 'a long list'),
        h('nav', 'tabs'),
      ]),
  })
}

describe('the jsdom version of the overscroll spec', () => {
  it('is green because it never finds anything to assert on', () => {
    const { container } = renderShell()

    const containers = scrollContainers(container)

    // The loop the browser spec's assertion lives in. Zero iterations.
    for (const element of containers) {
      expect(getComputedStyle(element).overscrollBehaviorY).toBe('contain')
    }

    expect(containers, 'no scroller was found, so nothing above was checked').toHaveLength(0)
  })

  it('cannot see overflow-y even on the element that declares it', () => {
    const { container } = renderShell()
    const main = container.querySelector('main')!

    expect(main.className, 'the class really is on the element').toContain('overflow-y-auto')
    expect(getComputedStyle(main).overflowY, 'and it computes to the initial value').toBe('visible')

    // Reading the property directly is no better, and is worse in one way:
    // jsdom does model `overscroll-behavior-y`, so it answers with a real,
    // plausible-looking value. That value is the CSS initial value, returned
    // whether or not `overscroll-contain` is on the element — the same answer
    // a genuinely unguarded scroller gives.
    expect(getComputedStyle(main).overscrollBehaviorY).toBe('auto')
  })

  it('has no layout to make an element scrollable in the first place', () => {
    const { container } = renderShell()
    const main = container.querySelector('main')!

    // Even the non-CSS route to "does this scroll" is closed: with no layout
    // engine, every box is zero-sized, so content can never overflow it.
    expect(main.scrollHeight).toBe(0)
    expect(main.clientHeight).toBe(0)
  })
})
