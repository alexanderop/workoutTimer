import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { decodeNewSession, decodePresetDraft } from '@/db/converters'

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
})
