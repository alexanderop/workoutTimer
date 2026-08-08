import { render } from 'vitest-browser-vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import { forcePseudoState } from '../../helpers/pseudoState'
import type { PseudoState } from '../../helpers/pseudoState'
import { catalogueViewport, frame, matchCatalogue } from './catalogue'

/**
 * The variant catalogue for Button — the enumeration Storybook would keep in a
 * CSF file, kept as plain data instead. It is the single list; the grid below
 * and any future docs page read from it, so a variant added to
 * `buttonVariants` and not to this list shows up as a missing column rather
 * than as silently untested CSS.
 *
 * `src/components/ui/**` is excluded from coverage and from knip, and its
 * `hover:` / `focus-visible:` classes are reachable from no other tier, so
 * these screenshots are the only thing standing between a token rename and a
 * silently broken design system.
 */
const VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
] as const satisfies readonly NonNullable<ButtonVariants['variant']>[]

const SIZES = ['default', 'sm', 'lg', 'icon'] as const satisfies readonly NonNullable<
  ButtonVariants['size']
>[]

/** One row per variant, one column per size. */
const Grid = defineComponent({
  render: () =>
    frame(
      VARIANTS.map((variant) =>
        h(
          'div',
          { key: variant, class: 'flex items-center gap-3' },
          SIZES.map((size) =>
            h(Button, { key: size, variant, size }, () => (size === 'icon' ? 'I' : variant)),
          ),
        ),
      ),
    ),
})

function buttons(): HTMLElement[] {
  return [...document.querySelectorAll('button')]
}

describe('Button variants', () => {
  it('renders every variant at every size', async () => {
    await catalogueViewport()
    const screen = render(Grid)
    await expect.element(screen.getByRole('button', { name: 'destructive' }).first()).toBeVisible()

    await matchCatalogue('button-grid-rest')
  })

  // Each state gets its own baseline: a regression in the focus ring and a
  // regression in the hover fill are different bugs, and a combined shot would
  // let one mask the other.
  //
  // `active` is deliberately absent. `buttonVariants` declares no `active:`
  // class, so its shot came out byte-identical to the rest baseline — a
  // screenshot that pins nothing but still has to be reviewed on every
  // rebaseline. Add it here the same day the primitive grows a pressed state.
  it.for<[PseudoState]>([['hover'], ['focus-visible']])(
    'renders every variant with :%s forced',
    async ([state]) => {
      await catalogueViewport()
      const screen = render(Grid)
      await expect
        .element(screen.getByRole('button', { name: 'destructive' }).first())
        .toBeVisible()

      await forcePseudoState(buttons(), [state])

      await matchCatalogue(`button-grid-${state}`)
    },
  )
})
