import { render } from 'vitest-browser-vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { Switch } from '@/components/ui/switch'
import { forcePseudoState } from '../../helpers/pseudoState'
import { catalogueViewport, frame, matchCatalogue, row } from './catalogue'

/**
 * Switch is the only primitive whose appearance is driven by `data-state`
 * rather than by a prop class: reka writes `data-[state=checked]` on the root
 * and the thumb, and Tailwind keys `bg-primary` and `translate-x-4` off it.
 * That coupling spans two packages, so it breaks from either side — a reka
 * upgrade that renames the attribute is as fatal as a token rename here, and
 * neither shows up in a behavioural test that only asserts `aria-checked`.
 */
const Catalogue = defineComponent({
  render: () =>
    frame([
      row('unchecked', h(Switch, { modelValue: false })),
      row('checked', h(Switch, { modelValue: true })),
      row('focus-visible, unchecked', h(Switch, { modelValue: false, 'data-case': 'focus-off' })),
      row('focus-visible, checked', h(Switch, { modelValue: true, 'data-case': 'focus-on' })),
      row('disabled, unchecked', h(Switch, { modelValue: false, disabled: true })),
      row('disabled, checked', h(Switch, { modelValue: true, disabled: true })),
    ]),
})

describe('Switch states', () => {
  it('renders checked, unchecked, focus-visible, and disabled', async () => {
    await catalogueViewport()
    render(Catalogue)

    const focusTargets = document.querySelectorAll('[data-case^="focus-"]')
    expect(focusTargets).toHaveLength(2)

    // The thumb slides via `transition-transform`; matchCatalogue settles
    // animations before shooting, or the checked rows are caught mid-travel.
    await forcePseudoState(focusTargets, ['focus-visible'])

    await matchCatalogue('switch-states')
  })
})
