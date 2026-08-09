import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { i18n } from '@/i18n'
import { it as base } from '../../../fixtures'

/** A sheet with more content than a keyboard-shrunk viewport can show. */
const Harness = defineComponent({
  render: () =>
    h(Dialog, { open: true, modal: false }, () => [
      h(DialogContent, null, () => [
        h(DialogTitle, () => 'Tall sheet'),
        h(DialogDescription, () => 'Scroll me'),
        ...Array.from({ length: 30 }, (_, index) => h('p', `line ${index}`)),
        h('button', { type: 'button' }, 'Save'),
      ]),
    ]),
})

const it = base.extend('tallSheet', async ({}, { onCleanup }) => {
  const mounted = render(Harness, { global: { plugins: [i18n] } })
  onCleanup(async () => {
    await mounted.unmount()
    document.documentElement.style.removeProperty('--keyboard-inset')
  })

  // Shrink the viewport only after the cleanup is registered — a throw above
  // must not leak a ~200px viewport into every later test in the file. The
  // variable is read live by CSS, so setting it after mount changes nothing.
  const inset = Math.max(0, window.innerHeight - 200)
  document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)

  return {
    get body(): HTMLElement {
      const body = document.querySelector('[data-slot="dialog-body"]')
      if (!(body instanceof HTMLElement)) throw new Error('dialog body not found')
      return body
    },
    get sheet(): HTMLElement {
      const sheet = document.querySelector('[data-slot="dialog-content"]')
      if (!(sheet instanceof HTMLElement)) throw new Error('dialog content not found')
      return sheet
    },
    submit: page.getByRole('button', { name: 'Save' }),
  }
})

/** The floor `safe-area-bottom` clamps to, in px — `[--safe-bottom-min:1.5rem]`. */
const MINIMUM_BOTTOM_INSET = 24

describe('DialogContent', () => {
  it('scrolls its content when the keyboard shrinks the viewport', async ({ tallSheet }) => {
    await expect.element(page.getByText('Tall sheet')).toBeVisible()

    const { body, submit } = tallSheet
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)

    await expect.element(submit).not.toBeInViewport()

    // Scrolling to the end brings the submit button into view — without a
    // scroll region it would be clipped by the sheet and unreachable.
    // In-viewport only measures intersection, so also assert visibility.
    body.scrollTop = body.scrollHeight
    await expect.element(submit).toBeInViewport()
    await expect.element(submit).toBeVisible()
  })

  // Measures the gap a user perceives rather than the property that produces
  // it, so swapping padding for a spacer element would still pass. The runner
  // resolves env(safe-area-inset-bottom) to 0 — exactly what a flat-bottomed
  // phone does, which is the case the clamp in `safe-area-bottom` exists for.
  it('keeps its last control clear of the bottom edge with no home indicator', async ({
    tallSheet,
  }) => {
    const { body, sheet, submit } = tallSheet

    body.scrollTop = body.scrollHeight
    await expect.element(submit).toBeInViewport()

    const gap =
      sheet.getBoundingClientRect().bottom - submit.element().getBoundingClientRect().bottom

    expect(
      gap,
      'the sheet is flush against its last control. `safe-area-bottom` and `pb-6` both write padding-bottom at equal specificity, and the utility is emitted last — so env(safe-area-inset-bottom) wins and resolves to 0 on every device without a home indicator.',
    ).toBeGreaterThanOrEqual(MINIMUM_BOTTOM_INSET)
  })
})
