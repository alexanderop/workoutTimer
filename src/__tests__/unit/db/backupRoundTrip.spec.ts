import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPreset,
  createSession,
  exportData,
  importData,
  listPresets,
  listSessions,
  resetDatabase,
  runDb,
} from '@/db'

describe('workout backup', () => {
  beforeEach(resetDatabase)

  it('round-trips sessions and presets', async () => {
    await runDb(
      createPreset({
        name: 'Ten minute AMRAP',
        config: { mode: 'amrap', durationMs: 600_000 },
        workoutNotes: '10 air squats',
      }).pipe(Effect.orDie),
    )
    await runDb(
      createSession({
        config: { mode: 'emom', intervalMs: 60_000, rounds: 10 },
        workoutNotes: 'Every minute',
        countdownDurationMs: 0,
      }).pipe(Effect.orDie),
    )

    const payload = await runDb(exportData.pipe(Effect.orDie))
    await resetDatabase()
    await runDb(importData(payload).pipe(Effect.orDie))

    expect(await runDb(listPresets.pipe(Effect.orDie))).toMatchObject([
      { name: 'Ten minute AMRAP' },
    ])
    expect(await runDb(listSessions.pipe(Effect.orDie))).toMatchObject([
      { config: { mode: 'emom', rounds: 10 } },
    ])
  })

  it('replaces what is on disk rather than merging into it', async () => {
    await runDb(
      createPreset({
        name: 'In the backup',
        config: { mode: 'amrap', durationMs: 600_000 },
        workoutNotes: '',
      }).pipe(Effect.orDie),
    )
    const payload = await runDb(exportData.pipe(Effect.orDie))

    // A preset created *after* the export is not part of this backup, so
    // restoring it must take the preset away again. Merging would leave a
    // database that never existed at any point in time.
    await runDb(
      createPreset({
        name: 'Created after the export',
        config: { mode: 'amrap', durationMs: 300_000 },
        workoutNotes: '',
      }).pipe(Effect.orDie),
    )
    await runDb(importData(payload).pipe(Effect.orDie))

    expect(await runDb(listPresets.pipe(Effect.orDie))).toMatchObject([{ name: 'In the backup' }])
  })
})
