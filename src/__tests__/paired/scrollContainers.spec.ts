import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { env } from '@/__tests__/helpers/env'
import '@/style.css'

/**
 * The vacuous pass, demonstrated on one shell by both runners.
 *
 * `src/__tests__/components/scrollContainers.spec.ts` is the real gate: it asks
 * the DOM which elements in the mounted app actually scroll, then holds those
 * to `overscroll-behavior-y: contain`. Asking the DOM is the whole idea —
 * naming `<main>` would miss the next scroller someone adds.
 *
 * This file runs the identical query against a fixed shell in both
 * environments, and the interesting number is how many elements it returns. In
 * a browser: at least one. In jsdom: zero, because `overflow-y-auto` computes
 * to `visible`. The filter matches nothing, the `for` loop never runs, and a
 * spec whose only assertion lives inside that loop is green on a shell with no
 * overscroll containment anywhere.
 *
 * The gate survives this by accident of good habit — it opens with
 * `expect(containers.length).toBeGreaterThan(0)`. That guard, written to stop a
 * vacuous pass, is the only line in it that would fail under jsdom. This is the
 * argument for writing such a guard even when it looks redundant.
 */
const expected = {
  jsdom: {
    scrollerCount: 0,
    overflowY: 'visible',
    // jsdom does model `overscroll-behavior-y`, so it answers with a real,
    // plausible-looking value. That value is the CSS initial value, returned
    // whether or not `overscroll-contain` is on the element — the same answer
    // a genuinely unguarded scroller gives.
    overscrollBehaviorY: 'auto',
    hasScrollableExtent: false,
  },
  browser: {
    scrollerCount: 1,
    overflowY: 'auto',
    overscrollBehaviorY: 'contain',
    hasScrollableExtent: true,
  },
}[env]

function scrollContainers(root: Element): Array<HTMLElement> {
  return [root, ...root.querySelectorAll('*')].filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false
    const { overflowY } = getComputedStyle(element)
    return overflowY === 'auto' || overflowY === 'scroll'
  })
}

// Mounted by hand rather than through @testing-library/vue: that package reads
// `process` at import time, which does not exist in the browser tier, and a
// spec shared by both runners cannot import it.
const mounted: Array<() => void> = []

function renderShell(): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)

  const app = createApp({
    render: () =>
      h('div', { class: 'flex h-dvh flex-col' }, [
        h('header', 'Timer'),
        // The real shell's scroller: an inner container that owns scrolling,
        // which is why `overscroll-behavior-y` on `body` stops nothing.
        h('main', { class: 'flex-1 overflow-y-auto overscroll-contain' }, [
          h('div', { class: 'h-[400vh]' }, 'a long list'),
        ]),
        h('nav', 'tabs'),
      ]),
  })
  app.mount(host)

  mounted.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount()
})

describe('asking the DOM which elements scroll', () => {
  it('finds the shell scroller, or finds nothing to assert on', () => {
    const container = renderShell()

    const containers = scrollContainers(container)

    // The loop the real gate's assertion lives in. Under jsdom it runs zero
    // times, and the test below it is the only thing standing between that and
    // a green check on an unguarded shell.
    for (const element of containers) {
      expect(getComputedStyle(element).overscrollBehaviorY).toBe('contain')
    }

    expect(
      containers.length,
      'no scroller was found, so nothing in the loop above was checked — a suite of assertions that never executed reports exactly the same green as one that passed',
    ).toBe(expected.scrollerCount)
  })
})

describe('reading the properties directly is no better', () => {
  it('computes overflow-y on the element that declares it', () => {
    const container = renderShell()
    const main = container.querySelector('main')!

    expect(main.className, 'the class really is on the element').toContain('overflow-y-auto')
    expect(getComputedStyle(main).overflowY).toBe(expected.overflowY)
  })

  it('computes overscroll-behavior-y on the element that declares it', () => {
    const container = renderShell()
    const main = container.querySelector('main')!

    expect(main.className).toContain('overscroll-contain')
    expect(
      getComputedStyle(main).overscrollBehaviorY,
      'the initial value is returned whether or not the class is present, so an assertion on it cannot tell a contained scroller from an unguarded one',
    ).toBe(expected.overscrollBehaviorY)
  })

  it('has layout to make the element scrollable in the first place', () => {
    const container = renderShell()
    const main = container.querySelector('main')!

    expect(
      main.scrollHeight > main.clientHeight,
      'even the non-CSS route to "does this scroll" is closed: with no layout engine every box is zero-sized, so content can never overflow one',
    ).toBe(expected.hasScrollableExtent)
  })
})
