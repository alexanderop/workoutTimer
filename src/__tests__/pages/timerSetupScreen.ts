import { expect, vi } from 'vitest'
import { page } from 'vitest/browser'

/** The timer setup route, addressed through its user-facing controls. */
export class TimerSetupScreen {
  async chooseTime(label: string): Promise<void> {
    await page.getByRole('button', { name: label, exact: true }).click()
  }

  async savePreset(name: string): Promise<void> {
    await page.getByLabelText('Preset name').fill(name)
    await page.getByRole('button', { name: 'Save as preset' }).click()
  }

  async chooseCustomTime(minutes: string, seconds: string): Promise<void> {
    await page.getByRole('button', { name: 'Custom time', exact: true }).click()
    await page.getByLabelText('Minutes').fill(minutes)
    await page.getByLabelText('Seconds').fill(seconds)
  }

  async start(): Promise<void> {
    await page.getByRole('button', { name: 'Start', exact: true }).click()
  }

  readonly expectTimeShortcut = vi.defineHelper(async (label: string): Promise<void> => {
    await expect.element(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  })

  /** Which shortcut the form is currently on, as the chips report it. */
  readonly expectTimeSelected = vi.defineHelper(async (label: string): Promise<void> => {
    await expect
      .element(page.getByRole('button', { name: label, exact: true }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  readonly expectPresetName = vi.defineHelper(async (name: string): Promise<void> => {
    await expect.element(page.getByLabelText('Preset name')).toHaveValue(name)
  })
}
