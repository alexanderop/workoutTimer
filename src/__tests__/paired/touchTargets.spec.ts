import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import { env } from '@/__tests__/helpers/env'
import '@/style.css'

/**
 * Why an assertion on a class string is not an assertion about size.
 *
 * `src/__tests__/touch/touchTargets.spec.ts` is the gate: it measures every
 * button with `getBoundingClientRect()` under touch emulation and holds it to
 * 44px. Two separate things make that unwritable in jsdom. There is no layout
 * engine, so every box measures 0×0 and the number the assertion is about does
 * not exist. And sizes are written touch-first and collapse under
 * `pointer-fine:`, so the 44px case only appears when the browser reports
 * `pointer: coarse` — which needs a `matchMedia` jsdom does not have.
 *
 * This file is what is left when you take that assertion away, and the last
 * test is the point of the whole tier. A jsdom suite falls back to checking the
 * class string. Then a later rule wins — a redefined token, a competing
 * utility, a design-system bump — and the control ships at 32px with its class
 * list untouched. The class assertion is green in both environments. Only the
 * environment that can measure notices anything happened.
 *
 * This runs in the `default` project, on a stock desktop pointer, so it does
 * not assert the 44px floor — that is the `touch` tier's job and needs a coarse
 * pointer to be meaningful.
 */
const SIZES = ['default', 'sm', 'lg', 'icon'] as const satisfies ReadonlyArray<
  NonNullable<ButtonVariants['size']>
>

const expected = {
  jsdom: { measuresAnything: false, hasMatchMedia: false, noticesTheRegression: false },
  browser: { measuresAnything: true, hasMatchMedia: true, noticesTheRegression: true },
}[env]

const mounted: Array<() => void> = []

// Mounted by hand: @testing-library/vue reads `process` at import time, which
// does not exist in the browser tier, so a shared spec cannot use it.
function renderSizes(): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)

  const app = createApp({
    render: () =>
      h(
        'div',
        SIZES.map((size) => h(Button, { key: size, size }, () => size)),
      ),
  })
  app.mount(host)

  mounted.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

function buttonNamed(host: HTMLElement, name: string): HTMLElement {
  const match = [...host.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === name,
  )
  if (!match) throw new Error(`no button labelled ${name}`)
  return match
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount()
})

describe('the measurement the gate makes', () => {
  it('returns a real height for every button size', () => {
    const host = renderSizes()

    for (const size of SIZES) {
      const height = buttonNamed(host, size).getBoundingClientRect().height

      expect(
        height > 0,
        `the "${size}" button measured ${height}px. Where nothing is laid out the real assertion — toBeGreaterThanOrEqual(44) — fails on all four sizes, not because the buttons are small but because there is no box. A red test that cannot go green gets dropped, not fixed.`,
      ).toBe(expected.measuresAnything)
    }
  })
})

describe('the condition the gate measures under', () => {
  it('can be asked for', () => {
    expect(typeof window.matchMedia === 'function').toBe(expected.hasMatchMedia)
  })

  it('cannot be usefully stubbed, in either environment', () => {
    // The `touch` tier opens with `expect(matchMedia('(pointer: coarse)')
    // .matches).toBe(true)` — a guard that fails loudly if touch emulation was
    // not actually enabled. Against a stub that guard passes by construction,
    // and so does its opposite, and so does a string that is not a media query
    // at all. A stub answers with whatever you decided before running the test;
    // it can never disagree with you. That is true here too, which is why
    // stubbing is not the way out of the row above.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))

    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    expect(matchMedia('(pointer: fine)').matches).toBe(true)
    expect(matchMedia('(this is not a media query)').matches).toBe(true)
  })
})

describe('the assertion a jsdom suite writes instead', () => {
  it('checks the class string, and cannot see the token move underneath it', () => {
    // A bare element rather than a `Button`, deliberately. Button sizes are
    // written touch-first and collapse under `pointer-fine:`, so on the stock
    // desktop pointer this project runs with, `h-touch-target` is not what
    // sizes them — that pathway belongs to the `touch` tier. This isolates the
    // utility itself.
    const probe = document.createElement('div')
    probe.className = 'h-touch-target'
    document.body.append(probe)
    mounted.push(() => probe.remove())

    expect(probe.className).toContain('h-touch-target')
    const before = probe.getBoundingClientRect().height

    // A later rule of equal specificity, which is every realistic way a
    // control ends up under the floor: a redefined token, a competing utility,
    // a plugin, a design-system bump. Not one of them touches a class name.
    const override = document.createElement('style')
    override.textContent = `.h-touch-target { height: 2rem; }`
    document.head.append(override)
    mounted.push(() => override.remove())

    expect(
      probe.className,
      'the class assertion is green before and after — this is the half of the story both environments agree on',
    ).toContain('h-touch-target')

    const after = probe.getBoundingClientRect().height
    expect(
      after < before,
      `the element went from ${before}px to ${after}px. Where those are the same number, the shipped regression and the healthy component are the same document, and \`toHaveClass\` will never tell them apart.`,
    ).toBe(expected.noticesTheRegression)
  })
})
