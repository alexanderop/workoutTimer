import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { InstallPrompt } from './installPrompt'

/**
 * Base for browser-tier screen objects. Screen objects own accessible
 * locators and UI actions; assertions about IndexedDB stay in the specs.
 * Routes without screen-specific locators (history, presets, settings)
 * mount through `openAt` directly instead of a subclass per route.
 */
export class AppScreen {
  /** App-wide install banner and dialog. */
  readonly install = new InstallPrompt()

  protected constructor(
    /** The mounted subtree used by axe and screenshot assertions. */
    readonly container: HTMLElement,
    private readonly unmount: () => Promise<void>,
  ) {}

  static async openAt(path: string): Promise<AppScreen> {
    const app = await renderApp(path)
    return new AppScreen(app.container, app.cleanup)
  }

  async close(): Promise<void> {
    await this.unmount()
  }

  get root(): Locator {
    return page.getByTestId('app')
  }

  get tabBar(): Locator {
    return page.getByRole('navigation')
  }

  readonly expectToast = vi.defineHelper(async (message: string): Promise<void> => {
    await expect.element(page.getByText(message)).toBeVisible()
  })
}
