import 'fake-indexeddb/auto'
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
import { db } from '@/db/schema'

describe('the repositories, through the operations the app calls', () => {
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

  /**
   * The caller plays a confirmation cue off this boolean, so "did nothing" and
   * "recorded a split" must be distinguishable. They used to both be `void`,
   * and the timer buzzed for rounds it had silently declined to store.
   */
  it('reports whether a round was actually recorded', async () => {
    const created = await runDb(
      createSession({
        config: { mode: 'forTime' },
        workoutNotes: '',
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )

    expect(await runDb(addSessionRound(created.id, 5_000).pipe(Effect.orDie))).toBe(true)
    // Within the debounce window of the split above — one round, not two.
    expect(await runDb(addSessionRound(created.id, 5_100).pipe(Effect.orDie))).toBe(false)
    // A session that is not running cannot take a split at all.
    expect(await runDb(addSessionRound('no-such-session', 9_000).pipe(Effect.orDie))).toBe(false)

    const [stored] = await runDb(listSessions.pipe(Effect.orDie))
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

  /**
   * Two settings writes really can overlap: `settingsMutation` is built
   * `concurrent: true` and the settings screen has half a dozen controls that
   * each fire one. Reading the row outside a transaction meant both fibers
   * merged their patch into the same `current`, and whichever `put` landed
   * second dropped the other patch — no error, no conflict, the preference
   * simply did not stick.
   */
  /**
   * The rule at the centre of docs/local-first.md — "never trust the shape of
   * stored data; trust the decode" — stated as a test rather than only as
   * prose. Rows outlive app versions, get restored with a profile, and are
   * editable from devtools, so a damaged one has to fail the read out loud:
   * silently dropping it would show a short history the user might then export
   * over their last good backup.
   */
  it('fails the whole read when one stored row does not match the schema', async () => {
    await runDb(
      createSession({
        config: { mode: 'amrap', durationMs: 600_000 },
        workoutNotes: '',
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )
    // `db.table(name)` rather than `db.sessions`, which is typed — the point is
    // to write a row the type says cannot exist, because devtools can.
    //
    // It carries a `createdAt` on purpose. `listSessions` reads through the
    // `createdAt` index, and IndexedDB leaves a row *missing* the indexed key
    // out of that index entirely — such a row is skipped rather than refused,
    // which is a different (and quieter) fate than the one under test here.
    await db.table('sessions').add({ id: 'damaged', status: 'nonsense', createdAt: Date.now() })

    // The failure *is* the assertion, so `Effect.flip` (docs/index.md).
    const error = await runDb(listSessions.pipe(Effect.flip, Effect.orDie))

    expect(error).toBeInstanceOf(DatabaseError)
    expect(error.operation).toBe('decode session row')
  })

  it('does not lose a patch when two settings writes overlap', async () => {
    await Promise.all([
      runDb(updateTimerSettings({ soundEnabled: false }).pipe(Effect.orDie)),
      runDb(updateTimerSettings({ keepAwake: false }).pipe(Effect.orDie)),
    ])

    const settings = await runDb(getTimerSettings.pipe(Effect.orDie))
    expect({ soundEnabled: settings.soundEnabled, keepAwake: settings.keepAwake }).toEqual({
      soundEnabled: false,
      keepAwake: false,
    })
  })

  it('applies a patch to what is on disk, not to the defaults', async () => {
    await runDb(updateTimerSettings({ soundEnabled: false }).pipe(Effect.orDie))
    await runDb(updateTimerSettings({ keepAwake: false }).pipe(Effect.orDie))

    const settings = await runDb(getTimerSettings.pipe(Effect.orDie))
    expect(settings.soundEnabled).toBe(false)
    expect(settings.keepAwake).toBe(false)
  })
})
