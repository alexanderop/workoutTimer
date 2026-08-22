import { DateTime, Effect, Schema } from 'effect'
import { TimerPresetSchema, TimerSettingsSchema, WorkoutSessionSchema } from './converters'
import { BackupInvalidError, type DatabaseError } from './errors'
import { listPresets, PresetsRepo } from './repositories/presets'
import { replaceAllData } from './repositories/restore'
import { listSessions, SessionsRepo } from './repositories/sessions'
import { getTimerSettings, SettingsRepo } from './repositories/settings'

const BACKUP_VERSION = 1 as const

const BackupSchema = Schema.Struct({
  app: Schema.Literal('workout-timer'),
  version: Schema.Literal(BACKUP_VERSION),
  exportedAt: Schema.String,
  sessions: Schema.Array(WorkoutSessionSchema),
  presets: Schema.Array(TimerPresetSchema),
  timerSettings: TimerSettingsSchema,
})

export type BackupPayload = typeof BackupSchema.Type

export const decodeBackup = (payload: unknown): Effect.Effect<BackupPayload, BackupInvalidError> =>
  Schema.decodeUnknownEffect(BackupSchema)(payload).pipe(
    Effect.mapError((error) => new BackupInvalidError({ message: error.message })),
  )

export const exportData: Effect.Effect<
  BackupPayload,
  DatabaseError,
  SessionsRepo | PresetsRepo | SettingsRepo
> = Effect.gen(function* () {
  const sessions = yield* listSessions
  const presets = yield* listPresets
  const timerSettings = yield* getTimerSettings
  const now = yield* DateTime.now
  return BackupSchema.make({
    app: 'workout-timer',
    version: BACKUP_VERSION,
    exportedAt: DateTime.formatIso(now),
    sessions,
    presets,
    timerSettings,
  })
}).pipe(Effect.withSpan('Backup.exportData'))

export const importData = Effect.fn('Backup.importData')(function* (payload: unknown) {
  const backup = yield* decodeBackup(payload)
  const sessions = [...backup.sessions]
  const presets = [...backup.presets]
  yield* replaceAllData(sessions, presets, backup.timerSettings)
  return { sessions: sessions.length, presets: presets.length }
})
