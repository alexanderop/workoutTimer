import { render } from '@testing-library/vue'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, Transition } from 'vue'

/**
 * Counterpart to `src/__tests__/components/ui/dialog/dialogContent.spec.ts`.
 *
 * The highest-value gap for this stack, and the least obvious. jsdom 30 expands
 * `margin`, `padding`, `border`, `font`, `flex` and `background` — it has real
 * handlers for those — but not `transition` or `animation`, which have none. So
 * `transition: opacity 300ms` computes to `transition-duration: 0s` while the
 * `transition` property itself hands your own string straight back.
 *
 * That number is not decorative — it is a branch condition in two libraries
 * this app depends on:
 *
 * - Vue's `whenTransitionEnds` calls `getTransitionInfo(el)`. Both timeouts
 *   come back `0`, so the type is `null` and it calls `resolve()` on the spot.
 *   The leave hook finishes in the same tick.
 * - Reka's `usePresence` reads `getComputedStyle(node).animationName || 'none'`.
 *   With `none` it takes the immediate `UNMOUNT` branch, firing `leave` and
 *   `after-leave` back to back.
 *
 * So a closing dialog is gone instantly, and the assertion everyone writes —
 * "after close, the content is unmounted" — is green. In Chromium the content
 * stays mounted for the animation, focus is restored after it, and a fast
 * close-then-reopen lands in Reka's `unmountSuspended` state. Every race lives
 * in a window jsdom does not have.
 */
const styles: Array<HTMLStyleElement> = []

function css(text: string): void {
  const style = document.createElement('style')
  style.textContent = text
  document.head.append(style)
  styles.push(style)
}

afterEach(() => {
  for (const style of styles.splice(0)) style.remove()
})

describe('the numbers the animation libraries branch on', () => {
  it('collapses the transition and animation shorthands to nothing', () => {
    css(`
      .shorthand { transition: opacity 300ms ease 50ms; animation: spin 1s linear; }
      .longhand { transition-duration: 300ms; animation-name: spin; }
    `)
    const el = document.createElement('div')
    el.className = 'shorthand'
    document.body.append(el)

    const shorthand = getComputedStyle(el)
    expect(shorthand.transitionDuration).toBe('0s')
    expect(shorthand.transitionDelay).toBe('0s')
    expect(shorthand.animationName).toBe('none')

    // Write the same thing longhand and it survives — which is why this reads
    // as "our CSS is fine" right up until someone uses the shorthand.
    el.className = 'longhand'
    expect(getComputedStyle(el).transitionDuration).toBe('300ms')
    expect(getComputedStyle(el).animationName).toBe('spin')
  })

  it('reports animation-name: none for the classes DialogContent actually ships', () => {
    const el = document.createElement('div')
    // Straight from DialogContent.vue.
    el.className = 'data-[state=closed]:animate-slide-down-mobile sm:duration-200'
    el.dataset.state = 'closed'
    document.body.append(el)

    // This is the exact value `usePresence` branches on.
    expect(getComputedStyle(el).animationName).toBe('none')
  })
})

const Fading = defineComponent({
  props: { show: { type: Boolean, required: true } },
  setup(props) {
    return () =>
      h(Transition, { name: 'fade' }, () =>
        props.show ? h('p', { class: 'sheet' }, 'Sheet') : null,
      )
  },
})

describe('what that does to a leave transition', () => {
  it('unmounts in the same tick, so the assertion everyone writes is green', async () => {
    css(`
      .fade-leave-active { transition: opacity 300ms ease; }
      .fade-leave-to { opacity: 0; }
    `)

    const { queryByText, rerender } = render(Fading, { props: { show: true } })

    expect(queryByText('Sheet')).not.toBeNull()

    await rerender({ show: false })
    await nextTick()

    // In Chromium this is still on screen for 300ms. Here the leave resolved
    // synchronously, because getTransitionInfo saw a 0s duration.
    expect(queryByText('Sheet')).toBeNull()
  })
})
