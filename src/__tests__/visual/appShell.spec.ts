import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../helpers/renderApp'
import { resetAppState } from '../helpers/reset'

/**
 * Screenshot baselines live in __screenshots__/ next to this file and are
 * platform-specific. Regenerate deliberately with `pnpm test:visual:update`
 * after intentional UI changes — see docs/testing-strategy.md.
 */
describe('visual regression', () => {
  let cleanup: (() => void) | undefined

  beforeEach(resetAppState)
  afterEach(() => {
    cleanup?.()
    document.documentElement.classList.remove('dark')
  })

  it('app shell, light', async () => {
    const app = await renderApp()
    cleanup = app.cleanup

    await expect.element(page.getByText('No notes yet')).toBeVisible()
    await expect(page.getByTestId('app')).toMatchScreenshot('app-shell-light')
  })

  it('app shell, dark', async () => {
    const app = await renderApp()
    cleanup = app.cleanup

    await expect.element(page.getByText('No notes yet')).toBeVisible()
    document.documentElement.classList.add('dark')
    await expect(page.getByTestId('app')).toMatchScreenshot('app-shell-dark')
  })
})
