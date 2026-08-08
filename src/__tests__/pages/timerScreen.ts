import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'
import { TimerResultScreen } from './timerResultScreen'
import { TimerRunScreen } from './timerRunScreen'
import { TimerSetupScreen } from './timerSetupScreen'

/**
 * The workout journey. Route transitions expose a setup, run, and result
 * object so specs name intent while each screen owns its locators.
 */
export class TimerScreen extends AppScreen {
  readonly setup = new TimerSetupScreen()
  readonly run = new TimerRunScreen()
  readonly result = new TimerResultScreen()

  static async open(path = '/'): Promise<TimerScreen> {
    const app = await renderApp(path)
    return new TimerScreen(app.container, app.cleanup)
  }

  async modeChooser(): Promise<Locator> {
    await this.expectHome()
    return page.getByRole('region', { name: 'Workout Timer' })
  }

  // Scoped to the chooser region: mode names are substrings of the buttons'
  // accessible names, and outside the region a saved preset named "AMRAP 20"
  // would make the lookup ambiguous.
  async chooseMode(name: 'AMRAP' | 'For Time' | 'EMOM' | 'Tabata'): Promise<void> {
    const chooser = await this.modeChooser()
    await chooser.getByRole('button', { name }).click()
  }

  readonly expectHome = vi.defineHelper(async (): Promise<void> => {
    await expect
      .element(page.getByRole('heading', { name: 'Workout Timer', level: 1 }))
      .toBeVisible()
  })

  readonly expectRecovery = vi.defineHelper(async (): Promise<void> => {
    await expect.element(page.getByText('Workout in progress')).toBeVisible()
  })

  async resume(): Promise<void> {
    await page.getByRole('button', { name: 'Resume timer' }).click()
  }
}
