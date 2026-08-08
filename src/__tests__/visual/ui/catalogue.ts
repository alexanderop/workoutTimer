import type { VNode } from 'vue'
import { h } from 'vue'
import { page } from 'vitest/browser'
import { expect, vi } from 'vitest'

/**
 * Shared scaffolding for the `src/components/ui/**` catalogues — the role CSF
 * plays in a Storybook setup, as plain Vue render functions.
 *
 * Every primitive here varies along a different axis: Button by variant × size,
 * Input and Textarea by interaction state, Label by whether its `peer` sibling
 * is disabled, Switch by checked × disabled, Dialog by viewport. There is no
 * single grid shape that fits them, so this module offers a frame, a labelled
 * row, and a shooter, and lets each spec build its own matrix.
 */

const FRAME_SELECTOR = '[data-slot="catalogue"]'

/**
 * The tester iframe defaults to roughly 333px wide, which is narrower than
 * every catalogue here — the first draft of these specs shot `document.body`
 * at that width and committed baselines with the right-hand column sliced off.
 * A catalogue is not a phone screen, so widen deliberately before rendering.
 *
 * Height stays under the runner window: asking for 844 was silently ignored
 * and the shot came back at the default size.
 */
export async function catalogueViewport(): Promise<void> {
  await page.viewport(900, 700)
}

/**
 * Opaque background and padding. Without an explicit background the shot is
 * transparent and the comparator reads antialiasing against whatever the
 * runner painted underneath. `w-fit` keeps the frame tight around its rows so
 * the baseline is the catalogue rather than the catalogue plus dead viewport.
 */
export function frame(rows: VNode[]): VNode {
  return h(
    'div',
    { 'data-slot': 'catalogue', class: 'flex w-fit flex-col gap-4 bg-background p-6' },
    rows,
  )
}

/**
 * One labelled state. The label is rendered *into* the screenshot on purpose:
 * a failing baseline is a picture, and the reviewer needs to see which state
 * moved without counting rows against the source.
 */
export function row(label: string, content: VNode | VNode[]): VNode {
  return h('div', { key: label, class: 'flex items-center gap-4' }, [
    h('span', { class: 'w-40 shrink-0 text-xs text-muted-foreground' }, label),
    h('div', { class: 'flex w-72 items-center gap-3' }, content),
  ])
}

/**
 * Waits for CSS transitions and animations to reach their end state.
 *
 * The primitives lean on `transition-colors` and, in Switch's case,
 * `transition-transform`; the dialog runs a slide-up keyframe animation. A shot
 * taken mid-transition is a different picture on every run, which reads as a
 * flaky baseline rather than as the missing await it is.
 *
 * A cancelled animation rejects `finished` — that is a settled state for our
 * purposes, so it is swallowed rather than failing the test.
 */
export async function settle(): Promise<void> {
  await Promise.all(
    document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
  )
}

/**
 * Shoots the frame rather than the page, so the baseline is content-sized and
 * carries no viewport padding to drift. Wrapped in `vi.defineHelper` per
 * docs/vitest-practices.md, so a mismatch points at the spec line.
 */
export const matchCatalogue = vi.defineHelper(async (name: string) => {
  await settle()
  const el = document.querySelector(FRAME_SELECTOR)
  if (!el) throw new Error(`matchCatalogue: no ${FRAME_SELECTOR} rendered`)
  await expect(el).toMatchScreenshot(name)
})
