import { afterEach, describe, expect, it } from 'vitest'

/**
 * Counterpart to `src/__tests__/components/interaction.spec.ts`.
 *
 * `hitTesting.spec.ts` covers *where* a click lands. This file covers what a
 * click is made of, and what happens after it.
 *
 * jsdom's `HTMLElement.click()` fires exactly one `PointerEvent` of type
 * `click`. There is no `pointerdown`, no `mousedown`, no `focus`, no
 * `pointerup`, no `mouseup` — and no focus change, because focus on click is a
 * user-agent behaviour rather than something the click algorithm does.
 *
 * That is spec-correct for the *programmatic* `.click()` method, which is
 * precisely the trap: it is also the only click a simulated DOM can offer. A
 * real user pressing the same button produces the full sequence, and any
 * handler bound to `mousedown` — the usual choice for menus, drag handles and
 * anything that must beat a blur — never runs in a jsdom test at all.
 */
afterEach(() => {
  document.body.replaceChildren()
})

const POINTER_SEQUENCE = [
  'pointerdown',
  'mousedown',
  'focus',
  'pointerup',
  'mouseup',
  'click',
] as const

function recordingButton(): { button: HTMLButtonElement; seen: Array<string> } {
  const button = document.createElement('button')
  button.textContent = 'Delete workout'
  document.body.append(button)

  const seen: Array<string> = []
  for (const type of POINTER_SEQUENCE) {
    button.addEventListener(type, () => seen.push(type))
  }

  return { button, seen }
}

describe('a programmatic click is the only click available', () => {
  it('fires click alone, with no pointer or mouse sequence around it', () => {
    const { button, seen } = recordingButton()

    button.click()

    expect(seen).toEqual(['click'])
  })

  it('leaves focus on the body', () => {
    const { button } = recordingButton()

    button.click()

    // A test asserting "clicking the trigger focuses it" cannot be written
    // here, and its inverse — "focus moved somewhere else" — passes for free.
    expect(document.activeElement).toBe(document.body)
    expect(document.activeElement).not.toBe(button)
  })

  it('never runs a mousedown handler', () => {
    const { button } = recordingButton()
    let openedOnMouseDown = false
    button.addEventListener('mousedown', () => (openedOnMouseDown = true))

    button.click()

    // The menu that opens on mousedown stays shut, so every assertion about it
    // has to be written against an event the test dispatched by hand.
    expect(openedOnMouseDown).toBe(false)
  })
})

describe('constraint validation has one message and no focus', () => {
  it('returns the same string for every kind of violation', () => {
    const form = document.createElement('form')
    const missing = document.createElement('input')
    missing.required = true
    const overflowing = document.createElement('input')
    overflowing.type = 'number'
    overflowing.max = '10'
    overflowing.value = '99'
    form.append(missing, overflowing)
    document.body.append(form)

    expect(missing.validity.valueMissing).toBe(true)
    expect(overflowing.validity.rangeOverflow).toBe(true)

    // jsdom returns a single hardcoded string for every failing constraint, so
    // an assertion on message text passes without describing anything.
    expect(missing.validationMessage).toBe('Constraints not satisfied')
    expect(overflowing.validationMessage).toBe('Constraints not satisfied')
  })

  it('does not focus the first invalid control on reportValidity', () => {
    const form = document.createElement('form')
    const missing = document.createElement('input')
    missing.required = true
    form.append(missing)
    document.body.append(form)

    expect(form.reportValidity()).toBe(false)

    // `reportValidity` is aliased to `checkValidity` — the source says so:
    // "Since jsdom has no user interaction, it's the same as #checkValidity".
    // So the half of it that users experience, focusing and revealing the
    // offending field, is absent.
    expect(document.activeElement).toBe(document.body)
  })
})
