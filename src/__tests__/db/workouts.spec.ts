import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSessionRound,
  createPreset,
  createSession,
  DatabaseError,
  getTimerSettings,
  listPresets,
  listSessions,
  pauseSession,
  resetDatabase,
  resumeSession,
  runDb,
  updateTimerSettings,
} from '@/db'

describe('workouts repository', () => {
  beforeEach(resetDatabase)

  it('creates a recoverable active session', async () => {
    const created = await runDb(
      createSession({
        config: { mode: 'amrap', durationMs: 600_000 },
        workoutNotes: 'Cindy',
        countdownDurationMs: 3_000,
      }).pipe(Effect.orDie),
    )
    expect(created.status).toBe('countdown')
    expect(created.startedAt - created.createdAt).toBe(3_000)
    expect(await runDb(listSessions.pipe(Effect.orDie))).toMatchObject([{ id: created.id }])
  })

  it('enforces one active session', async () => {
    const draft = {
      config: { mode: 'forTime' } as const,
      workoutNotes: '',
      countdownDurationMs: 0 as const,
    }
    await runDb(createSession(draft).pipe(Effect.orDie))
    const error = await runDb(createSession(draft).pipe(Effect.flip, Effect.orDie))
    expect(error).toBeInstanceOf(DatabaseError)
  })

  it('pauses, resumes, and captures a round', async () => {
    const created = await runDb(
      createSession({
        config: { mode: 'forTime' },
        workoutNotes: '',
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )
    await runDb(pauseSession(created.id).pipe(Effect.orDie))
    await runDb(resumeSession(created.id).pipe(Effect.orDie))
    await runDb(addSessionRound(created.id, 5_000).pipe(Effect.orDie))
    const [stored] = await runDb(listSessions.pipe(Effect.orDie))
    expect(stored?.status).toBe('running')
    expect(stored?.rounds).toEqual([{ capturedAtElapsedMs: 5_000 }])
  })

  it('stores presets and timer settings', async () => {
    const preset = await runDb(
      createPreset({
        name: '  Eight rounds  ',
        config: { mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 8 },
        workoutNotes: '',
      }).pipe(Effect.orDie),
    )
    await runDb(
      createSession({
        presetId: preset.id,
        config: preset.config,
        workoutNotes: preset.workoutNotes,
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )
    await runDb(updateTimerSettings({ soundEnabled: false }).pipe(Effect.orDie))
    expect(await runDb(listPresets.pipe(Effect.orDie))).toMatchObject([
      { name: 'Eight rounds', lastUsedAt: expect.any(Number) },
    ])
    expect((await runDb(getTimerSettings.pipe(Effect.orDie))).soundEnabled).toBe(false)
  })
})
