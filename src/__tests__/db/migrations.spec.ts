import Dexie from 'dexie'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { getTimerSettings, runDb } from '@/db'
import { db } from '@/db/schema'

/**
 * Seeds a database exactly as v1 of the app wrote it, then lets the real
 * `db` open on top of it — which is what happens on a user's phone when the
 * app updates. Covers the `upgrade()` half of the schema-change rule; the
 * decoding-default half lives in the unit tier (converters.spec.ts).
 */
async function seedV1Database(rows: { timerSettings: Array<object> }): Promise<void> {
  db.close()
  await Dexie.delete('workout-timer')
  const legacy = new Dexie('workout-timer')
  legacy.version(1).stores({
    presets: 'id, updatedAt, lastUsedAt',
    sessions: 'id, status, createdAt, presetId',
    timerSettings: 'id',
  })
  await legacy.open()
  await legacy.table('timerSettings').bulkAdd(rows.timerSettings)
  legacy.close()
}

describe('database migrations', () => {
  it('adds soundVolume to a v1 settings row on upgrade', async () => {
    await seedV1Database({
      timerSettings: [
        {
          id: 'timer',
          soundEnabled: true,
          hapticsEnabled: false,
          spokenCountdownEnabled: false,
          startCountdownMs: 5_000,
          keepAwake: true,
          updatedAt: 1,
        },
      ],
    })

    await db.open()
    const row = await db.timerSettings.get('timer')
    expect(row?.soundVolume).toBe(1)

    const settings = await runDb(getTimerSettings.pipe(Effect.orDie))
    expect(settings).toMatchObject({ soundVolume: 1, hapticsEnabled: false })
  })
})
