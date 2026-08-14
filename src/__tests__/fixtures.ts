import { Effect } from 'effect'
import { test } from 'vitest'
import { nextTick } from 'vue'
import { resetThemeState, setColorScheme } from '@/state/theme'
import { createPreset, createSession, runDb, updateTimerSettings } from '@/db'
import { resetAppState } from './helpers/reset'
import { AppScreen } from './pages/appScreen'
import { TimerScreen } from './pages/timerScreen'

async function prepareTimer(): Promise<void> {
  await resetAppState()
  await runDb(updateTimerSettings({ startCountdownMs: 0 }).pipe(Effect.orDie))
}

async function openScreen(
  path: string,
  onCleanup: (cleanup: () => void | Promise<void>) => void,
): Promise<AppScreen> {
  await resetAppState()
  const screen = await AppScreen.openAt(path)
  onCleanup(() => screen.close())
  return screen
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
  // Cold entry into setup through the /timer/:mode deep link — the path a
  // bookmark, reload, or PWA shortcut takes, with no home-chooser click state.
  .extend('amrapSetup', async ({}, { onCleanup }) => {
    await prepareTimer()
    const timer = await TimerScreen.open('/timer/amrap')
    onCleanup(() => timer.close())
    return timer
  })
  // A saved preset opened for editing, cold, through the URL the presets list
  // links to. The preset exists on disk before the screen mounts, so the form
  // has to seed itself from a row that arrives after its first render.
  .extend('presetSetup', async ({}, { onCleanup }) => {
    await prepareTimer()
    const preset = await runDb(
      createPreset({
        name: 'Twenty minute grind',
        config: { mode: 'amrap', durationMs: 1_200_000 },
        workoutNotes: '',
      }).pipe(Effect.orDie),
    )
    const timer = await TimerScreen.open(`/timer/amrap?preset=${preset.id}`)
    onCleanup(() => timer.close())
    return { preset, timer }
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
  .extend('history', async ({}, { onCleanup }) => openScreen('/history', onCleanup))
  .extend('presets', async ({}, { onCleanup }) => openScreen('/presets', onCleanup))
  .extend('settings', async ({}, { onCleanup }) => openScreen('/settings', onCleanup))
  .extend('theme', async ({}, { onCleanup }) => {
    onCleanup(() => resetThemeState())
    return {
      // Through the real mechanism, not a hand-toggled class: the preference
      // goes to storage and the app's atoms follow, so whatever useTheme
      // writes to the document is what the screenshot captures. A fixture has
      // no component, hence the registry-free `setColorScheme` rather than
      // `useTheme()`. The tick lets the re-render land before the screenshot.
      async dark(): Promise<void> {
        setColorScheme('dark')
        await nextTick()
      },
    }
  })
