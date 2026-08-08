import { render } from 'vitest-browser-vue'
import { describe, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { Textarea } from '@/components/ui/textarea'
import { forcePseudoState } from '../../helpers/pseudoState'
import { catalogueViewport, frame, matchCatalogue, row } from './catalogue'

/**
 * Textarea carries Input's state classes plus `min-h-24`, which is the only
 * thing distinguishing the two at rest — and exactly the kind of value that a
 * token sweep silently rewrites. The shot pins the height as well as the ring.
 */
const Catalogue = defineComponent({
  render: () =>
    frame([
      row('placeholder', h(Textarea, { placeholder: 'How did it feel?' })),
      row('filled', h(Textarea, { modelValue: 'Felt strong on the last round.' })),
      row('focus-visible', h(Textarea, { modelValue: 'Focused', 'data-case': 'focus' })),
      row('disabled', h(Textarea, { modelValue: 'Locked', disabled: true })),
    ]),
})

describe('Textarea states', () => {
  it('renders placeholder, filled, focus-visible, and disabled', async () => {
    await catalogueViewport()
    render(Catalogue)
    const focusTarget = document.querySelector('[data-case="focus"]')
    if (!focusTarget) throw new Error('focus case not rendered')

    await forcePseudoState(focusTarget, ['focus-visible'])

    await matchCatalogue('textarea-states')
  })
})
