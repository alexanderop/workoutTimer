import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Transition } from 'vue'
import { env } from '@/__tests__/helpers/env'
import '@/style.css'

/**
 * The highest-value gap for this stack, and the least obvious.
 *
 * jsdom 30 expands `margin`, `padding`, `border`, `font`, `flex` and
 * `background` — it has real handlers for those — but not `transition` or
 * `animation`, which have none. So `transition: opacity 300ms` computes to
 * `transition-duration: 0s` while the `transition` property itself hands your
 * own string straight back. Write the same thing longhand and it survives,
 * which is why this reads as "our CSS is fine" right up until someone uses the
 * shorthand.
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
 * The last test is the consequence, and it is the one worth reading twice.
 * "After close, the content is unmounted" is the assertion everyone writes, and
 * it is **green in jsdom for the wrong reason** — not because the close
 * animation completed but because it never started. In Chromium the content is
 * still on screen 300ms later. Focus restored too early, a double tap
 * reopening mid-close, a `v-if` unmounting under an active transition: every
 * one of those races lives inside a window jsdom does not have.
 */
const expected = {
  jsdom: {
    shorthandDurationSeconds: 0,
    shorthandDelaySeconds: 0,
    shorthandAnimationName: 'none',
    longhandDurationSeconds: 0.3,
    dialogAnimationResolves: false,
    stillMountedMidLeave: false,
  },
  browser: {
    shorthandDurationSeconds: 0.3,
    shorthandDelaySeconds: 0.05,
    shorthandAnimationName: 'spin',
    longhandDurationSeconds: 0.3,
    dialogAnimationResolves: true,
    stillMountedMidLeave: true,
  },
}[env]

const styles: Array<HTMLStyleElement> = []
const mounted: Array<() => void> = []

function css(text: string): void {
  const style = document.createElement('style')
  style.textContent = text
  document.head.append(style)
  styles.push(style)
}

/**
 * Both environments are asked in seconds, because they answer in different
 * units for the same declaration: Chromium normalises `300ms` to `0.3s`, jsdom
 * hands back `300ms`. That difference is cosmetic and not what this file is
 * about — normalising here keeps the table below stating the finding rather
 * than a serialisation detail.
 */
function seconds(value: string): number {
  const amount = Number.parseFloat(value)
  return value.trim().endsWith('ms') ? amount / 1000 : amount
}

afterEach(() => {
  for (const style of styles.splice(0)) style.remove()
  for (const unmount of mounted.splice(0)) unmount()
  document.body.replaceChildren()
})

describe('the numbers the animation libraries branch on', () => {
  it('expands the transition and animation shorthands, or collapses them', () => {
    css(`
      @keyframes spin { to { transform: rotate(360deg); } }
      .shorthand { transition: opacity 300ms ease 50ms; animation: spin 1s linear; }
    `)
    const element = document.createElement('div')
    element.className = 'shorthand'
    document.body.append(element)

    const computed = getComputedStyle(element)
    expect(
      seconds(computed.transitionDuration),
      'the shorthand has no expansion handler, so the longhand it should have produced stays at its initial value — and every library that reads that longhand takes the zero-duration branch',
    ).toBe(expected.shorthandDurationSeconds)
    expect(seconds(computed.transitionDelay)).toBe(expected.shorthandDelaySeconds)
    expect(computed.animationName).toBe(expected.shorthandAnimationName)
  })

  it('keeps the same declaration written longhand, in both environments', () => {
    css(`
      @keyframes spin { to { transform: rotate(360deg); } }
      .longhand { transition-duration: 300ms; animation-name: spin; }
    `)
    const element = document.createElement('div')
    element.className = 'longhand'
    document.body.append(element)

    // This is what makes the row above so easy to miss: longhand survives
    // everywhere, so a spot check on the wrong property reports agreement.
    const computed = getComputedStyle(element)
    expect(seconds(computed.transitionDuration)).toBe(expected.longhandDurationSeconds)
    expect(computed.animationName).toBe('spin')
  })

  it('resolves animation-name for the classes DialogContent actually ships', () => {
    const element = document.createElement('div')
    // Straight from DialogContent.vue.
    element.className = 'data-[state=closed]:animate-slide-down-mobile sm:duration-200'
    element.dataset.state = 'closed'
    document.body.append(element)

    // This is the exact value `usePresence` branches on. `none` sends it down
    // the immediate-UNMOUNT path.
    expect(getComputedStyle(element).animationName !== 'none').toBe(
      expected.dialogAnimationResolves,
    )
  })
})

// Driven by a module-level ref rather than a prop so the mount is a single
// component — the wrapper needed to feed a reactive prop would be a second one.
const show = ref(true)

const Fading = defineComponent({
  setup() {
    return () =>
      h(Transition, { name: 'fade' }, () =>
        show.value ? h('p', { class: 'sheet' }, 'Sheet') : null,
      )
  },
})

describe('what that does to a leave transition', () => {
  it('keeps the element mounted for the duration, or unmounts in the same tick', async () => {
    css(`
      .fade-leave-active { transition: opacity 300ms ease; }
      .fade-leave-to { opacity: 0; }
    `)

    const host = document.createElement('div')
    document.body.append(host)
    show.value = true
    const app = createApp(Fading)
    app.mount(host)
    mounted.push(() => {
      app.unmount()
      host.remove()
    })

    const onScreen = (): boolean => host.textContent?.includes('Sheet') ?? false
    expect(onScreen(), 'nothing was rendered, so the leave below proves nothing').toBe(true)

    show.value = false
    await nextTick()
    // Deliberately well inside the 300ms window rather than at the end of it.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(
      onScreen(),
      'the element was gone 50ms into a 300ms leave. "After close, the content is unmounted" then passes because the animation never started — and every race that lives in those 300ms is invisible to the suite asserting it.',
    ).toBe(expected.stillMountedMidLeave)
  })
})
