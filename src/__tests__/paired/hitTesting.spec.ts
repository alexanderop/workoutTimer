import { page, userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { browserOnly, env } from '@/__tests__/helpers/env'

/**
 * Clicks that land on elements the user could never have hit.
 *
 * A real click is resolved by hit-testing: the browser takes a point and finds
 * the topmost element there. jsdom has no layout, so it has no hit-testing —
 * `document.elementFromPoint` is undefined and every box is 0×0. A click
 * therefore lands on whatever element you handed the test helper, and nothing
 * above it in z-order can intervene.
 *
 * Playwright's actionability checks are the other half of the comparison: a
 * browser-mode click waits for the element to be visible, stable, enabled, and
 * *the hit target at the action point* — the last check existing precisely to
 * catch a scrim or overlay swallowing the click.
 *
 * The first test is the one to read. `button.click()` reaches the handler
 * through a full-screen scrim **in both environments**, because a programmatic
 * click bypasses hit-testing by definition. That is not a jsdom bug. It is why
 * the blindness is so hard to see: the only click a simulated DOM can produce
 * is exactly the click that was never going to notice the overlay.
 */
const expected = {
  jsdom: {
    hasElementFromPoint: false,
    mediaFeaturePointerEvents: false,
    hiddenAtThisViewport: false,
  },
  browser: {
    hasElementFromPoint: true,
    mediaFeaturePointerEvents: true,
    hiddenAtThisViewport: true,
  },
}[env]

const sheets: Array<HTMLStyleElement> = []

function css(text: string): void {
  const style = document.createElement('style')
  style.textContent = text
  document.head.append(style)
  sheets.push(style)
}

function buttonUnderScrim() {
  let clicked = false
  const button = document.createElement('button')
  button.textContent = 'Delete workout'
  button.addEventListener('click', () => (clicked = true))
  document.body.append(button)

  // The scrim a dialog puts over the app. It covers the button completely, at
  // a higher z-index.
  const scrim = document.createElement('div')
  scrim.style.cssText = 'position: fixed; inset: 0; z-index: 99'
  document.body.append(scrim)

  return { button, clicked: () => clicked }
}

afterEach(() => {
  for (const sheet of sheets.splice(0)) sheet.remove()
  document.body.replaceChildren()
})

describe('a full-screen scrim over a button', () => {
  it('does not stop a programmatic click, in either environment', () => {
    const { button, clicked } = buttonUnderScrim()

    button.click()

    expect(
      clicked(),
      'the handler ran with a scrim covering the button. A programmatic click does not hit-test, so this is correct everywhere — and it is the only click one of these two environments has.',
    ).toBe(true)
  })

  it('can be asked what is actually at a point', () => {
    buttonUnderScrim()

    expect(
      document.elementFromPoint instanceof Function,
      'without hit-testing there is no way to ask which element a user would have reached, so an overlay cannot participate in the test at all',
    ).toBe(expected.hasElementFromPoint)
  })

  browserOnly('intercepts a real click before it reaches the button', async () => {
    const { clicked } = buttonUnderScrim()

    // Actionability: the click waits for the button to be the hit target at
    // the action point, and it never becomes one. This is the assertion the
    // other environment cannot write in any form.
    await expect(
      userEvent.click(page.getByRole('button', { name: 'Delete workout' }), { timeout: 1500 }),
    ).rejects.toThrow()

    expect(clicked()).toBe(false)
  })
})

describe('pointer-events: none only works when the cascade can see it', () => {
  it('computes it from a plain rule, in either environment', () => {
    css(`.blocked { pointer-events: none; }`)
    const button = document.createElement('button')
    button.className = 'blocked'
    document.body.append(button)

    expect(getComputedStyle(button).pointerEvents).toBe('none')
  })

  it('computes it from a media query, which is where Tailwind puts it', () => {
    // What `md:pointer-events-none` compiles to.
    css(`@media (min-width: 1px) { .blocked { pointer-events: none; } }`)
    const button = document.createElement('button')
    button.className = 'blocked'
    document.body.append(button)

    expect(
      getComputedStyle(button).pointerEvents === 'none',
      'the guard that refuses to click a `pointer-events: none` element reads the computed value, and the computed value never received the declaration — so the click proceeds and the handler runs',
    ).toBe(expected.mediaFeaturePointerEvents)
  })
})

describe('toBeVisible-style checks inherit the same blindness', () => {
  it('sees a control the browser has hidden at this viewport', () => {
    css(`@media (min-width: 1px) { .desktop-only { display: none; } }`)
    const button = document.createElement('button')
    button.className = 'desktop-only'
    button.textContent = 'Export'
    document.body.append(button)

    expect(
      getComputedStyle(button).display === 'none',
      'visibility is decided from computed style. Where the rule never landed, the query succeeds, the element reads as visible, and a test goes on to click a button that is not on screen.',
    ).toBe(expected.hiddenAtThisViewport)
  })
})
