import { DateTime, Effect, Schema } from 'effect'
import {
  StoredTimerPresetSchema,
  StoredTimerSettingsSchema,
  StoredWorkoutSessionSchema,
  toTimerPreset,
  toTimerSettings,
  toWorkoutSession,
} from './converters'
import { BackupInvalidError, type DatabaseError } from './errors'
import { WorkoutsRepo } from './repositories/workouts'

const BACKUP_VERSION = 1 as const

const BackupSchema = Schema.Struct({
  app: Schema.Literal('workout-timer'),
  version: Schema.Literal(BACKUP_VERSION),
  exportedAt: Schema.String,
  sessions: Schema.Array(StoredWorkoutSessionSchema),
  presets: Schema.Array(StoredTimerPresetSchema),
  timerSettings: StoredTimerSettingsSchema,
})

export type BackupPayload = typeof BackupSchema.Type

export const decodeBackup = (payload: unknown): Effect.Effect<BackupPayload, BackupInvalidError> =>
  Schema.decodeUnknownEffect(BackupSchema)(payload).pipe(
    Effect.mapError((error) => new BackupInvalidError({ message: error.message })),
  )

export const exportData: Effect.Effect<BackupPayload, DatabaseError, WorkoutsRepo> = Effect.gen(
  function* () {
    const repo = yield* WorkoutsRepo
    const sessions = yield* repo.listSessions()
    const presets = yield* repo.listPresets()
    const timerSettings = yield* repo.getSettings()
    const now = yield* DateTime.now
    return BackupSchema.make({
      app: 'workout-timer',
      version: BACKUP_VERSION,
      exportedAt: DateTime.formatIso(now),
      sessions,
      presets,
      timerSettings,
    })
  },
).pipe(Effect.withSpan('Backup.exportData'))

export const importData = Effect.fn('Backup.importData')(function* (payload: unknown) {
  const backup = yield* decodeBackup(payload)
  const repo = yield* WorkoutsRepo
  const sessions = backup.sessions.map(toWorkoutSession)
  const presets = backup.presets.map(toTimerPreset)
  const settings = toTimerSettings(backup.timerSettings)
  yield* repo.putBackup(sessions, presets, settings)
  return { sessions: sessions.length, presets: presets.length }
})
