import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'

/**
 * Base for browser-tier screen objects. Screen objects own accessible
 * locators and UI actions; assertions about IndexedDB stay in the specs.
 */
export abstract class AppScreen {
  protected constructor(
    /** The mounted subtree used by axe and screenshot assertions. */
    readonly container: HTMLElement,
    private readonly unmount: () => void,
  ) {}

  close(): void {
    this.unmount()
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
