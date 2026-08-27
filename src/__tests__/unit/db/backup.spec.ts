import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase, runDb } from '@/db'
import { decodeBackup, importData } from '@/db/backup'
import { BackupInvalidError } from '@/db/errors'
import type { Schema } from 'effect'

describe('backup validation', () => {
  it('rejects backups for another app', async () => {
    const error = await Effect.runPromise(
      decodeBackup({ app: 'something-else', version: 1 }).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(BackupInvalidError)
  })

  it('accepts a complete empty workout backup', async () => {
    const backup = await Effect.runPromise(
      decodeBackup({
        app: 'workout-timer',
        version: 1,
        exportedAt: '2026-08-08T10:00:00.000Z',
        sessions: [],
        presets: [],
        timerSettings: {
          id: 'timer',
          soundEnabled: true,
          hapticsEnabled: true,
          spokenCountdownEnabled: false,
          startCountdownMs: 3_000,
          keepAwake: true,
          updatedAt: 1,
        },
      }),
    )
    expect(backup.sessions).toEqual([])
    expect(backup.presets).toEqual([])
    // Backups exported before db v2 have no soundVolume — the decoding
    // default keeps them importable.
    expect(backup.timerSettings.soundVolume).toBe(1)
  })
})

/**
 * The rule `BackupSchema` cannot state.
 *
 * The schema grades one row at a time, and "at most one workout is on the
 * clock" is a property of the set — the one `createSession` enforces
 * transactionally. A file carrying two restores cleanly and then wedges the
 * app: the home screen resumes whichever one it finds first, and every new
 * workout is refused by the other, with no way out through the UI.
 */
describe('restoring a backup', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  const session = (id: string, status: 'running' | 'completed'): Schema.Json => {
    const open = {
      id,
      config: { mode: 'forTime' },
      status,
      workoutNotes: '',
      notes: '',
      countdownDurationMs: 0,
      startedAt: 1,
      accumulatedPausedMs: 0,
      rounds: [],
      createdAt: 1,
      updatedAt: 1,
    }
    if (status === 'running') return open
    return { ...open, finishedAt: 2, finishReason: 'manual' }
  }

  const backup = (sessions: ReadonlyArray<Schema.Json>): Schema.Json => ({
    app: 'workout-timer',
    version: 1,
    exportedAt: '2026-08-08T10:00:00.000Z',
    sessions,
    presets: [],
    timerSettings: {
      id: 'timer',
      soundEnabled: true,
      soundVolume: 1,
      hapticsEnabled: true,
      spokenCountdownEnabled: false,
      startCountdownMs: 3_000,
      keepAwake: true,
      updatedAt: 1,
    },
  })

  it('refuses a file holding two unfinished workouts', async () => {
    const error = await runDb(
      importData(backup([session('a', 'running'), session('b', 'running')])).pipe(
        Effect.flip,
        Effect.orDie,
      ),
    )

    expect(error).toBeInstanceOf(BackupInvalidError)
  })

  it('accepts the one unfinished workout an export can legitimately hold', async () => {
    const restored = await runDb(
      importData(backup([session('a', 'running'), session('b', 'completed')])).pipe(Effect.orDie),
    )

    expect(restored.sessions).toBe(2)
  })
})
