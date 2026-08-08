import Dexie, { type Table } from 'dexie'
import type { TimerPreset, TimerSettings, WorkoutSession } from './converters'

class WorkoutTimerDatabase extends Dexie {
  presets!: Table<TimerPreset, string>
  sessions!: Table<WorkoutSession, string>
  timerSettings!: Table<TimerSettings, string>

  constructor() {
    super('workout-timer')

    this.version(1).stores({
      presets: 'id, updatedAt, lastUsedAt',
      sessions: 'id, status, createdAt, presetId',
      timerSettings: 'id',
    })

    // v2 adds `soundVolume` to the settings row. The upgrade only reaches
    // rows present at upgrade time — old backups imported later bypass it —
    // so the schema's decoding default in converters.ts carries the other
    // half (see docs/local-first.md).
    this.version(2).upgrade((tx) =>
      tx
        .table('timerSettings')
        .toCollection()
        .modify((row: { soundVolume?: number }) => {
          row.soundVolume ??= 1
        }),
    )
  }
}

export const db = new WorkoutTimerDatabase()

export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
