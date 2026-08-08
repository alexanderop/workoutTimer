import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { i18n } from '@/i18n'

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

function queryDialogBody(): HTMLElement {
  const body = document.querySelector('[data-slot="dialog-body"]')
  if (!(body instanceof HTMLElement)) throw new Error('dialog body not found')
  return body
}

describe('DialogContent', () => {
  let unmount: (() => void) | undefined

  afterEach(() => {
    unmount?.()
    document.documentElement.style.removeProperty('--keyboard-inset')
  })

  it('scrolls its content when the keyboard shrinks the viewport', async () => {
    // Leave the sheet ~200px tall, roughly a landscape phone with the
    // on-screen keyboard open.
    const inset = Math.max(0, window.innerHeight - 200)
    document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)

    const screen = render(Harness, { global: { plugins: [i18n] } })
    unmount = () => screen.unmount()

    await expect.element(page.getByText('Tall sheet')).toBeVisible()

    const body = queryDialogBody()
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)

    // Scrolling to the end brings the submit button into view — without a
    // scroll region it would be clipped by the sheet and unreachable.
    body.scrollTop = body.scrollHeight
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible()
  })
})
