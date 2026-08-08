import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { decodeNewSession, decodePresetDraft, decodeTimerSettings } from '@/db/converters'

const v1SettingsRow = {
  id: 'timer',
  soundEnabled: true,
  hapticsEnabled: true,
  spokenCountdownEnabled: false,
  startCountdownMs: 3_000,
  keepAwake: true,
  updatedAt: 1,
}

describe('workout schemas', () => {
  it('rejects an AMRAP without a positive duration', async () => {
    await expect(
      Effect.runPromise(
        decodeNewSession({
          config: { mode: 'amrap', durationMs: 0 },
          workoutNotes: '',
          countdownDurationMs: 3_000,
        }),
      ),
    ).rejects.toBeDefined()
  })

  it('trims preset names and workout notes', async () => {
    const draft = await Effect.runPromise(
      decodePresetDraft({
        name: '  Fast eight  ',
        config: { mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 8 },
        workoutNotes: '  burpees  ',
      }),
    )
    expect(draft).toMatchObject({ name: 'Fast eight', workoutNotes: 'burpees' })
  })

  it('defaults soundVolume to full for settings rows written before db v2', async () => {
    const settings = await Effect.runPromise(decodeTimerSettings(v1SettingsRow))
    expect(settings.soundVolume).toBe(1)
  })

  it('rejects a soundVolume outside 0..1', async () => {
    await expect(
      Effect.runPromise(decodeTimerSettings({ ...v1SettingsRow, soundVolume: 2 })),
    ).rejects.toBeDefined()
  })
})
