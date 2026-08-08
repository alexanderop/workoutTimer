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
    submit: page.getByRole('button', { name: 'Save' }),
  }
})

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
})
