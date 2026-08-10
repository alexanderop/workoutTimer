import { page, userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * What a real click is made of. Paired with
 * `src/__tests__/jsdom/interaction.spec.ts`, where the only available click is
 * a lone synthetic `click` event that moves no focus.
 *
 * This is the clearest case of a capability rather than an accuracy
 * difference. `element.click()` fires one event *in every environment* — that
 * part is spec-correct and this tier reproduces it below. What only a browser
 * can add is the other kind of click: input driven through the browser itself,
 * which produces the pointer sequence, the focus change, and the user-agent
 * behaviour around them.
 *
 * The practical consequence is `mousedown`. Menus, drag handles, and anything
 * that must act before a blur bind to it, and a suite whose only click is
 * `.click()` never runs those handlers once.
 */
const POINTER_SEQUENCE = ['pointerdown', 'mousedown', 'focus', 'pointerup', 'mouseup', 'click']

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

afterEach(() => {
  document.body.replaceChildren()
})

describe('a real click carries the whole pointer sequence', () => {
  it('fires pointer, mouse and focus events in order', async () => {
    const { seen } = recordingButton()

    await userEvent.click(page.getByRole('button', { name: 'Delete workout' }))

    expect(
      seen,
      'the click arrived without its pointer sequence. Anything bound to mousedown — a menu, a drag handle, a control that must act before blur — is unreachable from a test that cannot produce one.',
    ).toEqual(POINTER_SEQUENCE)
  })

  it('moves focus to the control that was pressed', async () => {
    const { button } = recordingButton()

    await userEvent.click(page.getByRole('button', { name: 'Delete workout' }))

    expect(
      document.activeElement,
      'the pressed control did not take focus, so focus-restore and focus-trap assertions built on it would be measuring nothing',
    ).toBe(button)
  })

  it('runs a mousedown handler before the click handler', async () => {
    const { button } = recordingButton()
    const order: Array<string> = []
    button.addEventListener('mousedown', () => order.push('opened menu'))
    button.addEventListener('click', () => order.push('handled click'))

    await userEvent.click(page.getByRole('button', { name: 'Delete workout' }))

    expect(order).toEqual(['opened menu', 'handled click'])
  })
})

describe('the programmatic click stays narrow, in every environment', () => {
  it('fires click alone and moves no focus', () => {
    const { button, seen } = recordingButton()

    button.click()

    // Asserted here so the contrast above is not mistaken for a jsdom bug:
    // `.click()` is meant to be this narrow. The gap is that a simulated DOM
    // has nothing else to offer.
    expect(seen).toEqual(['click'])
    expect(document.activeElement).not.toBe(button)
  })
})

describe('constraint validation is a real user-facing message', () => {
  it('describes each kind of violation differently', () => {
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

    expect(
      missing.validationMessage,
      'the message is empty, so there is nothing for a user to read',
    ).not.toBe('')
    expect(
      missing.validationMessage,
      'a missing value and an out-of-range value produced the same message. If they cannot be told apart, an assertion on message text is not describing the failure.',
    ).not.toBe(overflowing.validationMessage)
  })

  it('focuses the first invalid control on reportValidity', () => {
    const form = document.createElement('form')
    const valid = document.createElement('input')
    valid.value = 'fine'
    const missing = document.createElement('input')
    missing.required = true
    form.append(valid, missing)
    document.body.append(form)

    expect(form.reportValidity()).toBe(false)

    expect(
      document.activeElement,
      'reportValidity did not reveal the offending field. Reporting is the half users experience — without it, a form can be invalid with no indication of where.',
    ).toBe(missing)
  })
})
