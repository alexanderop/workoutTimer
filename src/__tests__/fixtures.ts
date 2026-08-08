import { Effect } from 'effect'
import { test } from 'vitest'
import { createSession, runDb, updateTimerSettings } from '@/db'
import { resetAppState } from './helpers/reset'
import { HistoryScreen } from './pages/historyScreen'
import { PresetsScreen } from './pages/presetsScreen'
import { SettingsScreen } from './pages/settingsScreen'
import { TimerScreen } from './pages/timerScreen'

async function prepareTimer(): Promise<void> {
  await resetAppState()
  await runDb(updateTimerSettings({ startCountdownMs: 0 }).pipe(Effect.orDie))
}

/**
 * Browser-tier fixtures own reset, mount, and teardown. Tests declare the
 * screen they drive and never carry lifecycle hooks or mutable cleanup state.
 */
export const it = test
  .extend('timer', async ({}, { onCleanup }) => {
    await prepareTimer()
    const timer = await TimerScreen.open()
    onCleanup(() => timer.close())
    return timer
  })
  .extend('recoverableTimer', async ({}, { onCleanup }) => {
    await prepareTimer()
    const session = await runDb(
      createSession({
        config: { mode: 'forTime' },
        workoutNotes: '',
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )
    const timer = await TimerScreen.open()
    onCleanup(() => timer.close())
    return { session, timer }
  })
  .extend('history', async ({}, { onCleanup }) => {
    await resetAppState()
    const history = await HistoryScreen.open()
    onCleanup(() => history.close())
    return history
  })
  .extend('presets', async ({}, { onCleanup }) => {
    await resetAppState()
    const presets = await PresetsScreen.open()
    onCleanup(() => presets.close())
    return presets
  })
  .extend('settings', async ({}, { onCleanup }) => {
    await resetAppState()
    const settings = await SettingsScreen.open()
    onCleanup(() => settings.close())
    return settings
  })
  .extend('theme', async ({}, { onCleanup }) => {
    onCleanup(() => document.documentElement.classList.remove('dark'))
    return {
      dark(): void {
        document.documentElement.classList.add('dark')
      },
    }
  })
