import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Shared page-object behavior for the shipped application. */
export abstract class AppPage {
  constructor(protected readonly page: Page) {}

  async open(path = '/'): Promise<void> {
    await this.page.goto(path)
  }

  async reload(): Promise<void> {
    await this.page.reload()
  }

  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true)
  }

  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false)
  }

  get shell(): Locator {
    return this.page.getByRole('navigation')
  }

  async waitForServiceWorkerControl(): Promise<void> {
    await this.page.evaluate(async () => navigator.serviceWorker.ready)
    await this.reload()
    await this.page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  }

  async expectShellVisible(): Promise<void> {
    await expect(this.shell).toBeVisible()
  }

  async expectServedByServiceWorker(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true)
  }

  async expectDocumentAnnounced(): Promise<void> {
    await expect(this.page).toHaveTitle(/\S/)
    await expect(this.page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}(-[A-Za-z]+)*$/)
  }
}
