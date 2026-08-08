import { render } from 'vitest-browser-vue'
import { describe, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { Input } from '@/components/ui/input'
import { forcePseudoState } from '../../helpers/pseudoState'
import { catalogueViewport, frame, matchCatalogue, row } from './catalogue'

/**
 * Input declares no variants — its whole surface is interaction state:
 * `placeholder:text-muted-foreground`, `focus-visible:ring-2`, and
 * `disabled:cursor-not-allowed disabled:opacity-50`. None of those classes is
 * reachable from any other tier, so this one shot is their only guard.
 */
const Catalogue = defineComponent({
  render: () =>
    frame([
      row('placeholder', h(Input, { placeholder: 'Reps' })),
      row('filled', h(Input, { modelValue: '12' })),
      row('focus-visible', h(Input, { modelValue: '12', 'data-case': 'focus' })),
      row('disabled', h(Input, { modelValue: '12', disabled: true })),
    ]),
})

describe('Input states', () => {
  it('renders placeholder, filled, focus-visible, and disabled', async () => {
    await catalogueViewport()
    render(Catalogue)
    const focusTarget = document.querySelector('[data-case="focus"]')
    if (!focusTarget) throw new Error('focus case not rendered')

    await forcePseudoState(focusTarget, ['focus-visible'])

    await matchCatalogue('input-states')
  })
})
