import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, onMounted, ref } from 'vue'
import { env } from '@/__tests__/helpers/env'

/**
 * The APIs that are simply absent — and the same list in a browser, where every
 * one of them is there.
 *
 * This is a different complaint from the CSS one. Those specs fail by answering
 * wrongly; these fail by not being there at all, which sounds like the safer
 * failure and is not. An absent API is a `TypeError` on mount, a `TypeError` on
 * mount gets resolved with a stub in `setup.ts`, and after that the behaviour is
 * permanently untestable and nobody remembers why.
 *
 * The second half of the file is that sequence played out on one component. The
 * stub gets the test running, and what it leaves behind is an assertion that
 * the component called a function with certain arguments — a call-signature
 * test wearing a behaviour test's clothes. The question worth asking, *did the
 * selected option end up visible*, is not answerable at any point along the
 * way, and the passing test is what stops anyone noticing.
 */
const PLATFORM_APIS = {
  // TimePicker centres the selected option on mount and on every change.
  scrollIntoView: () => document.body.scrollIntoView,
  // The Web Animations API, behind every transition Tailwind does not own.
  animate: () => document.body.animate,
  // <dialog> is what the bottom sheet and every confirmation is built on.
  showModal: () => document.createElement('dialog').showModal,
  // The whole PWA update path: registration, waiting worker, skipWaiting.
  serviceWorker: () => navigator.serviceWorker,
  // Copying a workout summary.
  clipboard: () => navigator.clipboard,
  // @vueuse composables reach for both; so does any virtualised list.
  ResizeObserver: () => globalThis.ResizeObserver,
  IntersectionObserver: () => globalThis.IntersectionObserver,
  // useKeyboardInset is built entirely on this one.
  visualViewport: () => window.visualViewport,
  // The condition the entire touch tier exists to create.
  matchMedia: () => window.matchMedia,
}

const expected = {
  jsdom: { present: false, mountSurvives: false },
  browser: { present: true, mountSurvives: true },
}[env]

describe('the platform APIs this app is built on', () => {
  it.each(Object.keys(PLATFORM_APIS))('%s is available', (name) => {
    const value = PLATFORM_APIS[name as keyof typeof PLATFORM_APIS]()

    expect(
      value !== undefined,
      `\`${name}\` is missing, so any code path that reaches it is a TypeError rather than a test failure — and the fix that unblocks the suite is a stub, after which nothing is being tested`,
    ).toBe(expected.present)
  })
})

/**
 * The shape of TimePicker's `scrollToSelected`, reduced to the one line that
 * matters: on mount, centre whichever option is currently pressed.
 */
const Picker = defineComponent({
  setup() {
    const scroller = ref<HTMLElement>()
    onMounted(() => {
      scroller.value
        ?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
    })
    return () =>
      h('div', { ref: scroller, style: 'height: 40px; overflow-y: auto' }, [
        h('button', { 'aria-pressed': 'false', style: 'display: block; height: 40px' }, '5 min'),
        h('button', { 'aria-pressed': 'true', style: 'display: block; height: 40px' }, '10 min'),
      ])
  },
})

const mounted: Array<() => void> = []

// Mounted by hand: @testing-library/vue reads `process` at import time, which
// does not exist in the browser tier, so a shared spec cannot use it.
function mountPicker(): { host: HTMLElement; error: unknown } {
  const host = document.createElement('div')
  document.body.append(host)

  let error: unknown
  const app = createApp(Picker)
  app.config.errorHandler = (caught) => {
    error = caught
  }
  app.mount(host)

  mounted.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, error }
}

// Restoring rather than deleting, because `delete Element.prototype
// .scrollIntoView` is a no-op in jsdom (nothing was there) and destroys a real
// method in a browser — which is its own small illustration of why teardown
// written against a simulated DOM does not transfer.
let restoreScrollIntoView: (() => void) | undefined

function stubScrollIntoView(record: (options?: ScrollIntoViewOptions | boolean) => void): void {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
  Element.prototype.scrollIntoView = function (options) {
    record(options)
  }
  restoreScrollIntoView = () => {
    if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original)
    else delete (Element.prototype as Partial<Element>).scrollIntoView
  }
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount()
  restoreScrollIntoView?.()
  restoreScrollIntoView = undefined
})

describe('what that costs at the point of use', () => {
  it('mounts a component that scrolls its selection into view', () => {
    const { error } = mountPicker()

    expect(
      error,
      'the component never rendered — this is a TypeError during mount, not a failed assertion, and it will be resolved with a stub',
    ).toSatisfy((caught: unknown) =>
      expected.mountSurvives
        ? caught === undefined
        : caught instanceof TypeError && /scrollIntoView is not a function/.test(caught.message),
    )
  })

  it('is reduced to a call-signature test once the stub is in place', () => {
    const calls: Array<ScrollIntoViewOptions | boolean | undefined> = []
    stubScrollIntoView((options) => calls.push(options))

    mountPicker()

    // This assertion passes in both environments, which is the point. It is
    // the assertion a jsdom suite ends up writing, and it says nothing about
    // whether anything moved. The browser tier does not need it — it can ask
    // the real question — but nothing about the test itself reveals that.
    expect(calls).toEqual([{ behavior: 'auto', block: 'nearest', inline: 'center' }])
  })
})
