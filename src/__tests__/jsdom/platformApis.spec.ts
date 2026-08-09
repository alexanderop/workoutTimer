import { render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, onMounted, ref } from 'vue'

/**
 * The APIs that are simply absent.
 *
 * This is a different complaint from the CSS one. Those specs fail by
 * answering wrongly; these fail by not being there at all, which sounds like
 * the safer failure and is not. An absent API is a `TypeError` on mount, and a
 * `TypeError` on mount gets resolved with a stub in `setup.ts` — after which
 * the behaviour is permanently untestable and nobody remembers why.
 *
 * Each entry below names where this app would hit it.
 */
const ABSENT = {
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

describe('APIs this app uses that jsdom does not have', () => {
  it.each(Object.keys(ABSENT))('%s is undefined', (name) => {
    expect(ABSENT[name as keyof typeof ABSENT]()).toBeUndefined()
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
      h('div', { ref: scroller }, [
        h('button', { 'aria-pressed': 'false' }, '5 min'),
        h('button', { 'aria-pressed': 'true' }, '10 min'),
      ])
  },
})

describe('what that costs at the point of use', () => {
  it('crashes a component that scrolls its selection into view on mount', () => {
    // In a browser this centres the selected option. Here it is a TypeError
    // during mount, and the component never renders at all.
    expect(() => render(Picker)).toThrowError(/scrollIntoView is not a function/)
  })

  it('takes a stub to get past it, and the stub is now the thing under test', () => {
    const calls: Array<ScrollIntoViewOptions | boolean | undefined> = []
    Element.prototype.scrollIntoView = function (options) {
      calls.push(options)
    }

    render(Picker)

    // This is the assertion a jsdom suite ends up writing: that the component
    // called a function with certain arguments. It cannot ask the only
    // question worth asking — did the selected option end up visible in the
    // scroller — because nothing was laid out and nothing scrolled. It is a
    // call-signature test wearing a behaviour test's clothes.
    expect(calls).toEqual([{ behavior: 'auto', block: 'nearest', inline: 'center' }])

    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
})
