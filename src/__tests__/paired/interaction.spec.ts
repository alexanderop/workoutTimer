import { page, userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { browserOnly, env } from '@/__tests__/helpers/env'

/**
 * What a click is made of — read by both runners.
 *
 * This file is included by the `jsdom` project *and* the browser projects, so
 * the same source runs twice and each environment answers for itself. It is
 * the first spec migrated to that shape, and it shows the three kinds of test
 * the shape produces:
 *
 * 1. **An invariant.** `element.click()` fires one `click` event and moves no
 *    focus, in every environment. Asserted identically on both sides so the
 *    contrast below is not mistaken for a jsdom bug — `.click()` is *meant* to
 *    be this narrow.
 * 2. **A capability only a browser has.** Input driven through the browser
 *    produces the whole pointer sequence and the focus change that goes with
 *    it. There is no jsdom answer to record, so those tests are `browserOnly`.
 *    The gap is that `.click()` is the only click a simulated DOM can offer.
 * 3. **A divergent answer.** Constraint validation exists in both and reports
 *    differently. Expectations are keyed off `env`, so one file states both
 *    answers and the jsdom suite stays green while documenting what it sees.
 *
 * The practical consequence of (2) is `mousedown`. Menus, drag handles, and
 * anything that must act before a blur bind to it, and a suite whose only
 * click is `.click()` never runs those handlers once.
 */
const POINTER_SEQUENCE = ['pointerdown', 'mousedown', 'focus', 'pointerup', 'mouseup', 'click']

function recordingButton() {
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

describe('the programmatic click stays narrow, in every environment', () => {
  it('fires click alone and moves no focus', () => {
    const { button, seen } = recordingButton()

    button.click()

    expect(seen).toEqual(['click'])
    expect(document.activeElement).not.toBe(button)
  })

  it('never runs a mousedown handler', () => {
    const { button } = recordingButton()
    let openedOnMouseDown = false
    button.addEventListener('mousedown', () => (openedOnMouseDown = true))

    button.click()

    expect(openedOnMouseDown).toBe(false)
  })
})

describe('a real click carries the whole pointer sequence', () => {
  browserOnly('fires pointer, mouse and focus events in order', async () => {
    const { seen } = recordingButton()

    await userEvent.click(page.getByRole('button', { name: 'Delete workout' }))

    expect(
      seen,
      'the click arrived without its pointer sequence. Anything bound to mousedown — a menu, a drag handle, a control that must act before blur — is unreachable from a test that cannot produce one.',
    ).toEqual(POINTER_SEQUENCE)
  })

  browserOnly('moves focus to the control that was pressed', async () => {
    const { button } = recordingButton()

    await userEvent.click(page.getByRole('button', { name: 'Delete workout' }))

    expect(
      document.activeElement,
      'the pressed control did not take focus, so focus-restore and focus-trap assertions built on it would be measuring nothing',
    ).toBe(button)
  })

  browserOnly('runs a mousedown handler before the click handler', async () => {
    const { button } = recordingButton()
    const order: Array<string> = []
    button.addEventListener('mousedown', () => order.push('opened menu'))
    button.addEventListener('click', () => order.push('handled click'))

    await userEvent.click(page.getByRole('button', { name: 'Delete workout' }))

    expect(order).toEqual(['opened menu', 'handled click'])
  })
})

describe('constraint validation reports differently in each environment', () => {
  /**
   * jsdom returns one hardcoded string — `'Constraints not satisfied'` — for
   * every failing constraint, and aliases `reportValidity` to `checkValidity`
   * because, in its own words, "since jsdom has no user interaction, it's the
   * same as #checkValidity". So the half users experience — a message that
   * describes the problem, and focus moving to reveal the field — is absent.
   */
  const expected = {
    jsdom: { sameMessageForEveryViolation: true, focusesInvalidControl: false },
    browser: { sameMessageForEveryViolation: false, focusesInvalidControl: true },
  }[env]

  it('gives each kind of violation its own message', () => {
    const form = document.createElement('form')
    const missing = document.createElement('input')
    missing.required = true
    const overflowing = document.createElement('input')
    overflowing.type = 'number'
    overflowing.max = '10'
    overflowing.value = '99'
    form.append(missing, overflowing)
    document.body.append(form)

    // Both environments agree the constraints are violated. Only the report
    // of them differs, which is what makes this a trap rather than a gap.
    expect(missing.validity.valueMissing).toBe(true)
    expect(overflowing.validity.rangeOverflow).toBe(true)
    expect(missing.validationMessage).not.toBe('')

    expect(
      missing.validationMessage === overflowing.validationMessage,
      `in ${env}, a missing value and an out-of-range value produce ${
        expected.sameMessageForEveryViolation ? 'the same' : 'different'
      } message. Where they cannot be told apart, an assertion on message text passes without describing the failure.`,
    ).toBe(expected.sameMessageForEveryViolation)
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
      document.activeElement === missing,
      `in ${env}, reportValidity ${
        expected.focusesInvalidControl ? 'revealed' : 'did not reveal'
      } the offending field. Reporting is the half users experience — without it, a form can be invalid with no indication of where.`,
    ).toBe(expected.focusesInvalidControl)
  })
})
