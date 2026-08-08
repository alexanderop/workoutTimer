import { describe, expect } from 'vitest'
import { it } from '../fixtures'

/**
 * Screenshot baselines live in __screenshots__/ next to this file and are
 * platform-specific. Regenerate deliberately with `pnpm test:visual:update`
 * after intentional UI changes — see docs/testing-strategy.md.
 */
describe('visual regression', () => {
  it('app shell, light', async ({ timer }) => {
    await timer.expectHome()
    await expect(timer.root).toMatchScreenshot('app-shell-light')
  })

  it('app shell, dark', async ({ timer, theme }) => {
    await timer.expectHome()
    theme.dark()
    await expect(timer.root).toMatchScreenshot('app-shell-dark')
  })
})
