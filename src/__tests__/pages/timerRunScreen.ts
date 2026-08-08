import { expect, vi } from 'vitest'
import { page } from 'vitest/browser'

/** The full-screen running timer route. */
export class TimerRunScreen {
  async addRound(): Promise<void> {
    await page.getByRole('button', { name: 'Add round' }).click()
  }

  /** Dispatch the double tap before either persistence request can settle. */
  addRoundTwiceInOneTick(): void {
    const button = page.getByRole('button', { name: 'Add round' }).element()
    if (!(button instanceof HTMLButtonElement)) throw new Error('add-round button not found')
    button.click()
    button.click()
  }

  async finish(): Promise<void> {
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Tap again to finish' }).click()
  }

  readonly expectRunning = vi.defineHelper(async (): Promise<void> => {
    await expect.element(page.getByText('Work', { exact: true })).toBeVisible()
  })

  readonly expectRounds = vi.defineHelper(async (count: number): Promise<void> => {
    await expect.element(page.getByText(`${count} rounds`)).toBeVisible()
  })

  readonly expectMode = vi.defineHelper(async (name: string): Promise<void> => {
    await expect.element(page.getByRole('heading', { name })).toBeVisible()
  })
}
