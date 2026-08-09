import { render } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

/**
 * Clicks that land on elements the user could never have hit.
 *
 * A real click is resolved by hit-testing: the browser takes a point and finds
 * the topmost element there. jsdom has no layout, so it has no hit-testing —
 * `document.elementFromPoint` is undefined and every box is 0×0. `user-event`
 * therefore dispatches on whatever element you handed it, and nothing above it
 * in z-order can intervene.
 *
 * Playwright's actionability checks are the other half of the comparison: a
 * browser-mode click waits for the element to be visible, stable, enabled, and
 * *the hit target at the action point* — the last check existing precisely to
 * catch a scrim or overlay swallowing the click.
 */
afterEach(() => {
  document.body.replaceChildren()
})

describe('an overlay cannot intercept anything', () => {
  it('clicks straight through a full-screen scrim', async () => {
    let clicked = false

    const { getByRole } = render({
      render: () =>
        h('div', [
          h('button', { onClick: () => (clicked = true) }, 'Delete workout'),
          // The scrim a dialog puts over the app. It covers the button
          // completely, at a higher z-index.
          h('div', { style: 'position: fixed; inset: 0; z-index: 99' }),
        ]),
    })

    await userEvent.click(getByRole('button', { name: 'Delete workout' }))

    // In Chromium this click is intercepted and never reaches the handler.
    // Here the scrim is not merely ignored — it cannot participate at all.
    expect(clicked).toBe(true)
    expect(document.elementFromPoint).toBeUndefined()
  })
})

describe('pointer-events: none only works when the cascade can see it', () => {
  it('is honoured from a plain rule', async () => {
    const style = document.createElement('style')
    style.textContent = `.blocked { pointer-events: none; }`
    document.head.append(style)

    let clicked = false
    const { getByRole } = render({
      render: () => h('button', { class: 'blocked', onClick: () => (clicked = true) }, 'Save'),
    })

    // user-event walks ancestors reading `pointerEvents` and refuses.
    await expect(userEvent.click(getByRole('button'))).rejects.toThrow(/pointer-events/i)
    expect(clicked).toBe(false)

    style.remove()
  })

  it('is ignored when it comes from a media query, which is where Tailwind puts it', async () => {
    const style = document.createElement('style')
    // What `md:pointer-events-none` compiles to.
    style.textContent = `@media (min-width: 1px) { .blocked { pointer-events: none; } }`
    document.head.append(style)

    let clicked = false
    const { getByRole } = render({
      render: () => h('button', { class: 'blocked', onClick: () => (clicked = true) }, 'Save'),
    })

    // The guard reads the computed value, and the computed value never got the
    // declaration — so the click proceeds and the handler runs.
    await userEvent.click(getByRole('button'))
    expect(clicked).toBe(true)

    style.remove()
  })
})

describe('toBeVisible-style checks inherit the same blindness', () => {
  it('finds a control the browser has hidden at this viewport', () => {
    const style = document.createElement('style')
    style.textContent = `@media (min-width: 1px) { .desktop-only { display: none; } }`
    document.head.append(style)

    const { getByRole } = render({
      render: () => h('button', { class: 'desktop-only' }, 'Export'),
    })

    // Testing Library decides visibility from computed style, and the computed
    // style never received the rule. So the query succeeds, the element reads
    // as visible, and a test can go on to click a button that is not on screen.
    expect(getComputedStyle(getByRole('button', { name: 'Export' })).display).toBe('inline-block')

    style.remove()
  })
})
