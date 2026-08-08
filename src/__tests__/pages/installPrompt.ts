import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'

export class InstallPrompt {
  private get appRoot(): Locator {
    return page.getByTestId('app')
  }

  get banner(): Locator {
    return this.appRoot.getByText('Install Workout Timer', { exact: true })
  }

  get installButton(): Locator {
    return this.appRoot.getByRole('button', { name: 'Install', exact: true })
  }

  get laterButton(): Locator {
    return this.appRoot.getByRole('button', { name: 'Not now' })
  }

  get dialog(): Locator {
    return page.getByRole('dialog')
  }

  get confirmButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Install', exact: true })
  }

  async openDialog(): Promise<void> {
    await this.installButton.click()
    await this.expectDialogOpen()
  }

  async dismiss(): Promise<void> {
    await this.laterButton.click()
    await this.expectHidden()
  }

  readonly expectVisible = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner, { timeout: 4000 }).toBeVisible()
  })

  readonly expectHidden = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner).not.toBeInTheDocument()
  })

  readonly expectNeverAppears = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await expect.element(this.banner).not.toBeInTheDocument()
  })

  readonly expectDialogOpen = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).toBeVisible()
  })

  readonly expectDialogClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).not.toBeInTheDocument()
  })
}
