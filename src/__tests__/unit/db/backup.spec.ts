import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { decodeBackup } from '@/db/backup'
import { BackupInvalidError } from '@/db/errors'

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
