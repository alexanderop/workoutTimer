import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect } from 'vitest'
import { h } from 'vue'
import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import { it as base } from '../fixtures'

/**
 * The 44px floor, asserted under the condition it exists for.
 *
 * This cannot live in any other tier. `matchMedia` is read-only from inside
 * the page, so `pointer: coarse` has to come from the browser context — see
 * the `touch` project in vitest.config.ts. The a11y tier does not cover it
 * either: axe's `target-size` rule uses the WCAG 2.2 AA floor of 24x24, so a
 * 40px control satisfies axe and fails us.
 *
 * Button sizes are written touch-first and collapse under `pointer-fine:`,
 * which means the numbers below are only reachable here — in `default`,
 * Chromium reports `pointer: fine` and the collapsed desktop heights win.
 */
const TOUCH_TARGET_FLOOR = 44

/** Every size the cva table offers, so a new one cannot ship unmeasured. */
const SIZES = ['default', 'sm', 'lg', 'icon'] as const satisfies ReadonlyArray<
  NonNullable<ButtonVariants['size']>
>

const it = base.extend('button', async ({}, { onCleanup }) => {
  const mounted = render({
    render: () =>
      h(
        'div',
        SIZES.map((size) => h(Button, { key: size, size }, () => size)),
      ),
  })
  onCleanup(() => mounted.unmount())

  return async (size: (typeof SIZES)[number]): Promise<number> => {
    const locator = page.getByRole('button', { name: size })
    await expect.element(locator).toBeVisible()
    return locator.element().getBoundingClientRect().height
  }
})

describe('the touch tier really is a touch tier', () => {
  it('reports a coarse pointer', () => {
    expect(
      matchMedia('(pointer: coarse)').matches,
      'this tier launched without touch emulation, so every assertion below is measuring a desktop pointer and proves nothing',
    ).toBe(true)
  })

  it('does not match hover', () => {
    expect(
      matchMedia('(hover: hover)').matches,
      'hover matches here, so `hover:` styles fire and this tier cannot tell a hover-only control from a working one',
    ).toBe(false)
  })
})

describe('controls clear the touch-target floor', () => {
  // One test rather than it.each: `it.each` fills the second parameter with
  // its own case data, so a fixture cannot ride along beside the size.
  it('every button size is at least 44px tall', async ({ button }) => {
    for (const size of SIZES) {
      const height = await button(size)

      expect(
        height,
        `the "${size}" button is ${height}px on a touch device. Sizes are written touch-first and collapse with \`pointer-fine:\` — a bare \`h-10\` applies to phones too. docs/touch-conventions.md`,
      ).toBeGreaterThanOrEqual(TOUCH_TARGET_FLOOR)
    }
  })

  it('every tab in the shell clears the floor', async ({ timer }) => {
    await timer.expectHome()

    const tabs = [...timer.container.querySelectorAll('nav button')]
    expect(tabs.length, 'no tabs found — the query is wrong').toBeGreaterThan(0)

    for (const tab of tabs) {
      expect(
        tab.getBoundingClientRect().height,
        `the "${tab.textContent?.trim()}" tab is under ${TOUCH_TARGET_FLOOR}px on a touch device`,
      ).toBeGreaterThanOrEqual(TOUCH_TARGET_FLOOR)
    }
  })
})
