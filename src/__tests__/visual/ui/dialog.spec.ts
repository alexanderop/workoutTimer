import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { i18n } from '@/i18n'
import { settle } from './catalogue'

/**
 * Dialog is the one primitive whose variance is neither prop nor state but
 * *viewport*: `DialogContent` is a bottom sheet pinned to the bottom edge, and
 * from `sm:` up the same element becomes a centered dialog with a close button
 * that is `hidden` below the breakpoint. Two whole-viewport shots are the
 * cheapest way to pin both, and nothing else in the suite renders the desktop
 * arrangement at all — `appShell` shoots the app at one size.
 *
 * `modal: true`, unlike the behavioural spec in `__tests__/components/ui/`,
 * which uses `modal: false` to keep scroll-lock off the runner's document.
 * Here modal mode is mandatory: reka gates the overlay on it
 * (`DialogOverlay.vue` renders under `v-if="rootContext?.modal.value"`), so
 * `modal: false` puts no overlay in the DOM and the shot silently covers none
 * of `DialogOverlay`'s `bg-black/50`. `render()` unmounts after each test,
 * which releases the lock.
 */
const Sheet = defineComponent({
  render: () =>
    h(Dialog, { open: true, modal: true }, () => [
      h(DialogContent, null, () => [
        h(DialogHeader, null, () => [
          h(DialogTitle, () => 'Discard workout?'),
          h(DialogDescription, () => 'This session has not been saved yet.'),
        ]),
        h(DialogFooter, null, () => [
          h(Button, { variant: 'ghost' }, () => 'Cancel'),
          h(Button, { variant: 'destructive' }, () => 'Discard'),
        ]),
      ]),
    ]),
})

async function mount() {
  const screen = render(Sheet, { global: { plugins: [i18n] } })
  await expect.element(screen.getByText('Discard workout?')).toBeVisible()
  // The sheet slides in via `animate-slide-up-mobile`; shooting mid-keyframe
  // produces a baseline that never reproduces.
  await settle()
  return screen
}

describe('Dialog layout', () => {
  // Whole-viewport shots, not element shots: *where* the sheet sits is the
  // thing under test, and an element-scoped screenshot would crop away the
  // evidence. Heights stay under the runner window — a request for 844 was
  // silently ignored and the shot came back at the default size instead.
  it('is a bottom sheet on a phone viewport', async () => {
    await page.viewport(390, 700)
    await mount()

    await expect(document.documentElement).toMatchScreenshot('dialog-bottom-sheet')
  })

  it('is a centered dialog from the sm breakpoint up', async () => {
    await page.viewport(900, 700)
    await mount()

    await expect(document.documentElement).toMatchScreenshot('dialog-centered')
  })
})
