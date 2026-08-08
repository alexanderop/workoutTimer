import { render } from 'vitest-browser-vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { catalogueViewport, frame, matchCatalogue, row, settle } from './catalogue'

/**
 * Label's only conditional styling is `peer-disabled:cursor-not-allowed
 * peer-disabled:opacity-50`, which Tailwind compiles to `.peer:disabled ~ &`.
 * That rule fires on *sibling structure*, not on a prop, so it is invisible to
 * a test that mounts the Label alone — and it silently dies if a refactor
 * wraps the control, drops the `peer` class, or reorders the two elements.
 *
 * Pairing an enabled and a disabled peer in one shot is what makes the rule
 * falsifiable: the two rows have to differ.
 */
const Catalogue = defineComponent({
  render: () =>
    frame([
      row('enabled peer', [
        h('span', { class: 'flex flex-col gap-1' }, [
          h(Input, { class: 'peer', modelValue: '12' }),
          h(Label, () => 'Reps'),
        ]),
      ]),
      row('disabled peer', [
        h('span', { class: 'flex flex-col gap-1' }, [
          h(Input, { class: 'peer', modelValue: '12', disabled: true }),
          h(Label, () => 'Reps'),
        ]),
      ]),
    ]),
})

describe('Label states', () => {
  it('dims only when its peer control is disabled', async () => {
    await catalogueViewport()
    const screen = render(Catalogue)
    await expect.element(screen.getByText('Reps').first()).toBeVisible()
    await settle()

    // The rule is a picture in the baseline, but assert it here too: a
    // screenshot that silently stopped exercising `peer-disabled:` still
    // passes forever once its baseline is regenerated.
    const labels = [...document.querySelectorAll('[data-slot="label"]')]
    const opacity = labels.map((label) => getComputedStyle(label).opacity)
    expect(opacity).toStrictEqual(['1', '0.5'])

    await matchCatalogue('label-states')
  })
})
