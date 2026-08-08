import { expect } from '@playwright/test'
import { AppPage } from './appPage'

/** The load-bearing workout journey against the production build. */
export class WorkoutPage extends AppPage {
  async startAmrap(): Promise<void> {
    await this.page.getByRole('button', { name: /AMRAP/ }).click()
    await this.page.getByRole('button', { name: '1 min', exact: true }).click()
    await this.page.getByRole('button', { name: 'Start', exact: true }).click()
  }

  async expectRunning(): Promise<void> {
    await expect(this.page.getByText('Work', { exact: true })).toBeVisible({ timeout: 8_000 })
  }

  async finish(): Promise<void> {
    await this.page.getByRole('button', { name: 'Finish workout' }).click()
    await this.page.getByRole('button', { name: 'Tap again to finish' }).click()
    await expect(this.page.getByRole('heading', { name: 'Workout complete' })).toBeVisible()
  }

  async saveResult(notes: string): Promise<void> {
    await this.page.getByLabel('Result notes').fill(notes)
    await this.page.getByRole('button', { name: 'Save result' }).click()
  }

  async expectResult(notes: string): Promise<void> {
    await expect(this.page.getByText(notes)).toBeVisible()
  }
}
