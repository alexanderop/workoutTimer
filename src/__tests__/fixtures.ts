import { Effect } from 'effect'
import { test } from 'vitest'
import { nextTick } from 'vue'
import { resetThemeState, useTheme } from '@/composables/useTheme'
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
  // Setup opened *as a preset* — the /timer/:mode?preset=… link the presets
  // list pushes. Seeded before the mount so the form has a named preset to
  // find in its first watcher run.
  .extend('presetSetup', async ({}, { onCleanup }) => {
    await prepareTimer()
    const preset = await runDb(
      createPreset({
        name: 'Friday conditioning',
        config: { mode: 'amrap', durationMs: 1_200_000 },
        workoutNotes: 'Ten burpees, ten pull-ups',
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
    const { isDark } = useTheme()
    onCleanup(async () => {
      resetThemeState()
      await nextTick()
    })
    return {
      // Through the real mechanism, not a hand-toggled class: whatever
      // useTheme writes to the document is what the screenshot captures.
      // useDark applies the `.dark` class from a `flush: 'post'` watcher,
      // hence the tick.
      async dark(): Promise<void> {
        isDark.value = true
        await nextTick()
      },
    }
  })
