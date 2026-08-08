import { Effect } from 'effect'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSession, listPresets, listSessions, runDb, updateTimerSettings } from '@/db'
import { renderApp } from '../../helpers/renderApp'
import { resetAppState } from '../../helpers/reset'

describe('workout timer flow', () => {
  let cleanup: (() => void) | undefined

  beforeEach(async () => {
    await resetAppState()
    await runDb(updateTimerSettings({ startCountdownMs: 0 }).pipe(Effect.orDie))
  })
  afterEach(() => cleanup?.())

  it('starts, records a round, completes, and saves a result', async () => {
    ;({ cleanup } = await renderApp())

    await page.getByRole('button', { name: /AMRAP/ }).click()
    await page.getByRole('button', { name: '1 min', exact: true }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect.element(page.getByText('Work', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Add round' }).click()
    await expect.element(page.getByText('1 rounds')).toBeVisible()

    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Tap again to finish' }).click()
    await expect.element(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible()

    await page.getByLabelText('Result notes').fill('Felt strong')
    await page.getByRole('button', { name: 'Save result' }).click()
    await expect.element(page.getByText('Felt strong')).toBeVisible()

    const [stored] = await runDb(listSessions.pipe(Effect.orDie))
    expect(stored).toMatchObject({ status: 'completed', notes: 'Felt strong' })
    expect(stored?.rounds).toHaveLength(1)
  })

  it('saves and reuses a preset', async () => {
    ;({ cleanup } = await renderApp())

    await page.getByRole('button', { name: /Tabata/ }).click()
    await page.getByLabelText('Preset name').fill('Fast eight')
    await page.getByRole('button', { name: 'Save as preset' }).click()
    await expect.element(page.getByText('Preset saved')).toBeVisible()

    expect(await runDb(listPresets.pipe(Effect.orDie))).toMatchObject([
      { name: 'Fast eight', config: { mode: 'tabata', rounds: 8 } },
    ])
  })

  /**
   * Saving a preset writes to the presets table, which reloads every atom
   * keyed on it. The setup form seeds itself from that same data, so a naive
   * "re-seed whenever presets change" left the user staring at the mode
   * default and a Start button that would run a workout they never configured.
   */
  it('keeps the configured values after saving them as a preset', async () => {
    ;({ cleanup } = await renderApp('/timer/amrap'))

    await page.getByRole('button', { name: '20 min', exact: true }).click()
    await page.getByLabelText('Preset name').fill('Twenty minute grind')
    await page.getByRole('button', { name: 'Save as preset' }).click()
    await expect.element(page.getByText('Preset saved')).toBeVisible()

    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect.element(page.getByText('Work', { exact: true })).toBeVisible()

    expect(await runDb(listSessions.pipe(Effect.orDie))).toMatchObject([
      { config: { mode: 'amrap', durationMs: 1_200_000 } },
    ])
  })

  it('offers 15-second shortcuts and accepts a custom raw time', async () => {
    ;({ cleanup } = await renderApp('/timer/amrap'))

    await expect.element(page.getByRole('button', { name: '15 sec', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Custom time', exact: true }).click()
    await page.getByLabelText('Minutes').fill('2')
    await page.getByLabelText('Seconds').fill('7')
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect.element(page.getByText('Work', { exact: true })).toBeVisible()
    expect(await runDb(listSessions.pipe(Effect.orDie))).toMatchObject([
      { config: { mode: 'amrap', durationMs: 127_000 } },
    ])
  })

  it('offers recovery for an active session', async () => {
    const created = await runDb(
      createSession({
        config: { mode: 'forTime' },
        workoutNotes: '',
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )
    ;({ cleanup } = await renderApp())

    await expect.element(page.getByText('Workout in progress')).toBeVisible()
    await page.getByRole('button', { name: 'Resume timer' }).click()
    await expect.element(page.getByRole('heading', { name: 'For Time' })).toBeVisible()
    expect(created.status).toBe('running')
  })
})
