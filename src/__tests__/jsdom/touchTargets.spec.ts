import { render } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import '@/style.css'

/**
 * Counterpart to `src/__tests__/touch/touchTargets.spec.ts`.
 *
 * The browser spec measures every button size with `getBoundingClientRect()`
 * under touch emulation and holds it to 44px. Two separate things make that
 * unwritable here.
 *
 * First, there is no layout engine, so every box measures 0×0 — the number the
 * assertion is about does not exist. Second, sizes are written touch-first and
 * collapse under `pointer-fine:`, so the 44px case only appears when the
 * browser reports `pointer: coarse` — and jsdom has no `matchMedia` at all.
 * Stubbing one does not help, because a stub answers with whatever you decided
 * before running the test; it can never disagree with you.
 *
 * What a jsdom suite writes instead is an assertion on the class string, which
 * is why the last test here is the interesting one: it stays green while the
 * button is the wrong size.
 */
const TOUCH_TARGET_FLOOR = 44

const SIZES = ['default', 'sm', 'lg', 'icon'] as const satisfies ReadonlyArray<
  NonNullable<ButtonVariants['size']>
>

function renderSizes() {
  return render({
    render: () =>
      h(
        'div',
        SIZES.map((size) => h(Button, { key: size, size }, () => size)),
      ),
  })
}

describe('the measurement the browser spec makes', () => {
  it('returns zero for every button size', () => {
    const { getByRole } = renderSizes()

    for (const size of SIZES) {
      const height = getByRole('button', { name: size }).getBoundingClientRect().height

      // The real assertion, `toBeGreaterThanOrEqual(44)`, fails on all four —
      // not because the buttons are small but because nothing was laid out.
      // A red test that cannot go green is dropped, not fixed.
      expect(height).toBe(0)
      expect(height).toBeLessThan(TOUCH_TARGET_FLOOR)
    }
  })
})

describe('the condition the browser spec measures under', () => {
  it('cannot be asked for', () => {
    expect(window.matchMedia).toBeUndefined()
  })

  it('can only be stubbed, which makes the tier’s self-check circular', () => {
    // The browser tier opens with `expect(matchMedia('(pointer: coarse)')
    // .matches).toBe(true)` — a guard that fails loudly if touch emulation was
    // not actually enabled. Here the same guard passes by construction.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))

    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    expect(matchMedia('(pointer: fine)').matches).toBe(true)
    expect(matchMedia('(this is not a media query)').matches).toBe(true)
  })
})

describe('the assertion a jsdom suite writes instead', () => {
  it('checks the class string, and passes while the button is 32px', () => {
    const { getByRole } = renderSizes()
    const button = getByRole('button', { name: 'default' })

    expect(button.className).toContain('h-touch-target')

    // `h-touch-target` resolves through the `--spacing-touch-target` token.
    // Redefining that token to 32px ships a button under the floor without
    // touching a single class name — so the assertion above cannot notice,
    // and neither can `toHaveClass`. The browser tier notices, because it
    // asks the laid-out element how tall it is.
    document.documentElement.style.setProperty('--spacing-touch-target', '2rem')

    expect(button.className, 'still green, still 32px tall').toContain('h-touch-target')
  })
})
