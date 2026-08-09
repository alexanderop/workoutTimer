import { afterEach, describe, expect, it } from 'vitest'

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
 */
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

describe('focus lands on elements the browser will not focus', () => {
  it('focuses an element with display: none', () => {
    expect(focusFresh((button) => (button.style.display = 'none'))).toBe(true)
  })

  it('focuses an element with visibility: hidden', () => {
    expect(focusFresh((button) => (button.style.visibility = 'hidden'))).toBe(true)
  })

  it('focuses an element carrying the hidden attribute', () => {
    expect(focusFresh((button) => (button.hidden = true))).toBe(true)
  })
})

describe('inert does not exist', () => {
  it('is not even a reflected property', () => {
    expect('inert' in document.body).toBe(false)
  })

  it('lets focus and clicks straight through an inert subtree', () => {
    const background = document.createElement('div')
    background.setAttribute('inert', '')
    const button = document.createElement('button')
    let clicked = false
    button.addEventListener('click', () => (clicked = true))
    background.append(button)
    document.body.append(background)

    button.focus()
    button.click()

    // The modal-correctness test worth writing is "while the dialog is open,
    // nothing behind it is reachable". Here its inverse passes instead: a
    // click on a background control succeeds, so forgetting `inert` — or
    // putting it on the wrong subtree — is invisible.
    expect(document.activeElement).toBe(button)
    expect(clicked).toBe(true)
  })
})

/**
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
describe('the pseudo-classes that answer false rather than throwing', () => {
  it('reports :modal as false on an open dialog', () => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)

    // Silence is the problem. A pseudo-class that threw would be caught on the
    // first run; one that returns false reads exactly like "this state is not
    // active", which is the assertion most state tests already make.
    expect(dialog.matches(':modal')).toBe(false)
  })
})
