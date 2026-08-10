import { Effect } from 'effect'
import { describe, expect } from 'vitest'
import { page } from 'vitest/browser'
import { getTimerSettings, runDb } from '@/db'
import { it } from '../../fixtures'

const storedSettings = () => runDb(getTimerSettings.pipe(Effect.orDie))

const countdownSelect = (): HTMLSelectElement =>
  page.getByLabelText('Start countdown').element() as HTMLSelectElement

describe('timer preferences', () => {
  it('stores the countdown length that was chosen', async ({ settings: _settings }) => {
    const select = countdownSelect()
    select.value = '10000'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    await expect.poll(async () => (await storedSettings()).startCountdownMs).toBe(10_000)
  })

  /**
   * A cached shell can outlive the build that served it, so the `<select>` on
   * screen may still offer a length this build no longer accepts. Nothing is
   * stored for one — and because nothing is stored, `:value` does not change
   * and Vue has no reason to re-render, which used to leave the control
   * displaying an option the database never took.
   */
  it('snaps back to the stored length when a stale option is chosen', async ({
    settings: _settings,
  }) => {
    const select = countdownSelect()
    const before = (await storedSettings()).startCountdownMs

    const stale = document.createElement('option')
    stale.value = '7000'
    stale.textContent = '7 seconds'
    select.append(stale)
    select.value = '7000'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    await expect.poll(() => select.value).toBe(String(before))
    expect((await storedSettings()).startCountdownMs).toBe(before)
  })
})
