import { afterEach, describe, expect, it } from 'vitest'
import { browserOnly, env } from '@/__tests__/helpers/env'

/**
 * Focus, which is the one thing a dialog test is really about.
 *
 * jsdom decides whether an element can be focused from `isFocusableAreaElement`,
 * which checks: does it have a default view, is it connected, its tabindex, its
 * tag name, and `disabled`. It consults no style, no `hidden`, no `inert`, and
 * no rendering state at all.
 *
 * So `focus()` succeeds on things a browser will not focus, and every
 * focus-trap, autofocus and restore-focus assertion passes unconditionally.
 * These are not tests that fail to catch a specific bug — they are tests that
 * cannot fail.
 *
 * ---
 *
 * `:focus-visible` is deliberately absent from this file.
 *
 * It is a tempting example and it does not hold. jsdom 30 replaced nwsapi with
 * `@asamuzakjp/dom-selector`, which implements a real modality heuristic, and a
 * paired measurement against Chromium agrees on the cases that matter: a
 * programmatic `button.focus()` matches in neither, a focused `<input>` matches
 * in both. (jsdom ≤26 did alias it to `:focus` — so this is a version-specific
 * fix, not a long-standing property.)
 *
 * One caveat, found the hard way: the heuristic is driven by a mutable event
 * log, so a programmatic button focus *does* start matching once earlier tests
 * in the same file have moved focus around. An assertion on it is therefore
 * order-dependent within a file — which is a reason to avoid asserting on it,
 * not evidence that jsdom gets it wrong.
 */
const expected = {
  jsdom: { focusesUnrenderedElements: true, hasInert: false, inertBlocksFocus: false },
  browser: { focusesUnrenderedElements: false, hasInert: true, inertBlocksFocus: true },
}[env]

function focusFresh(mutate: (button: HTMLButtonElement) => void): boolean {
  const button = document.createElement('button')
  button.textContent = 'target'
  document.body.append(button)
  mutate(button)
  ;(document.activeElement as HTMLElement | null)?.blur()
  button.focus()

  return document.activeElement === button
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('focus refuses elements that are not rendered', () => {
  it('declines an element with display: none', () => {
    expect(focusFresh((button) => (button.style.display = 'none'))).toBe(
      expected.focusesUnrenderedElements,
    )
  })

  it('declines an element with visibility: hidden', () => {
    expect(focusFresh((button) => (button.style.visibility = 'hidden'))).toBe(
      expected.focusesUnrenderedElements,
    )
  })

  it('declines an element carrying the hidden attribute', () => {
    expect(
      focusFresh((button) => (button.hidden = true)),
      'where focus lands on an element nobody can see, every focus-trap and restore-focus assertion in the suite passes whether or not the trap exists',
    ).toBe(expected.focusesUnrenderedElements)
  })
})

describe('inert', () => {
  it('is a reflected property', () => {
    expect('inert' in document.body).toBe(expected.hasInert)
  })

  it('keeps focus out of an inert subtree', () => {
    const background = document.createElement('div')
    background.setAttribute('inert', '')
    const button = document.createElement('button')
    background.append(button)
    document.body.append(background)
    ;(document.activeElement as HTMLElement | null)?.blur()

    button.focus()

    // The modal-correctness test worth writing is "while the dialog is open,
    // nothing behind it is reachable". Where inert does not exist, its inverse
    // passes instead: focus reaches a background control, so forgetting `inert`
    // — or putting it on the wrong subtree — is invisible.
    expect(document.activeElement !== button).toBe(expected.inertBlocksFocus)
  })

  it('does not stop a programmatic click, in either environment', () => {
    const background = document.createElement('div')
    background.setAttribute('inert', '')
    const button = document.createElement('button')
    let clicked = false
    button.addEventListener('click', () => (clicked = true))
    background.append(button)
    document.body.append(background)

    button.click()

    // Worth stating, because it is the trap inside the trap: `inert` blocks
    // *user* interaction. A synthetic `.click()` is not user interaction, so it
    // lands here too. A suite whose only click is `.click()` cannot observe
    // inert at all — see `interaction.spec.ts` for why that is the only click a
    // simulated DOM has.
    expect(clicked).toBe(true)
  })
})

describe('the pseudo-classes that answer false rather than throwing', () => {
  it('reports :modal as false on a non-modal open dialog, in either environment', () => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)

    // `open` alone is a non-modal dialog, so `false` is the correct answer
    // everywhere. This is here to keep the next test honest.
    expect(dialog.matches(':modal')).toBe(false)
  })

  browserOnly('reports :modal as true once the dialog is actually shown modally', () => {
    const dialog = document.createElement('dialog')
    document.body.append(dialog)
    dialog.showModal()

    // The distinction the test above cannot make. jsdom has no `showModal`
    // (see `platformApis.spec.ts`), so `:modal` is false for open and modal
    // dialogs alike — and silence is the problem. A pseudo-class that threw
    // would be caught on the first run; one that returns false reads exactly
    // like "this state is not active", which is the assertion most state tests
    // already make.
    expect(dialog.matches(':modal')).toBe(true)
    dialog.close()
  })
})
