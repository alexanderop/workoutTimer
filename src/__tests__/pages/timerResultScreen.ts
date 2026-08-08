import { expect, vi } from 'vitest'
import { page } from 'vitest/browser'

/** The result route shown after a workout is completed. */
export class TimerResultScreen {
  async save(notes: string): Promise<void> {
    await page.getByLabelText('Result notes').fill(notes)
    await page.getByRole('button', { name: 'Save result' }).click()
  }

  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible()
  })

  readonly expectNotes = vi.defineHelper(async (notes: string): Promise<void> => {
    await expect.element(page.getByText(notes)).toBeVisible()
  })
}
