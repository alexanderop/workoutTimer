import { DateTime, Effect, Schema } from 'effect'
import {
  isActiveSession,
  TimerPresetSchema,
  TimerSettingsSchema,
  WorkoutSessionSchema,
} from './converters'
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

export const decodeBackup = (
  payload: Schema.Json,
): Effect.Effect<BackupPayload, BackupInvalidError> =>
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

export const importData = Effect.fn('Backup.importData')(function* (payload: Schema.Json) {
  const backup = yield* decodeBackup(payload)
  const sessions = [...backup.sessions]
  const presets = [...backup.presets]

  // `BackupSchema` grades one row at a time, and "at most one workout is on
  // the clock" is a rule about the *set* — the one `createSession` enforces
  // transactionally, and the one `replaceAllData` cites as its reason to
  // replace rather than merge. A file carrying two of them restores cleanly
  // and then wedges the app: the home screen offers to resume whichever
  // `activeSessionAtom` finds first, and every new workout is refused by the
  // other. Checked here because this is the boundary the untrusted file
  // crosses; `replaceAllData` has no other caller.
  const unfinished = sessions.filter((session) => isActiveSession(session.status))
  if (unfinished.length > 1) {
    return yield* Effect.fail(
      new BackupInvalidError({
        message: `a backup may hold at most one unfinished workout, this one holds ${unfinished.length}`,
      }),
    )
  }

  yield* replaceAllData(sessions, presets, backup.timerSettings)
  return { sessions: sessions.length, presets: presets.length }
})
