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
  }
}

export const db = new WorkoutTimerDatabase()

export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
