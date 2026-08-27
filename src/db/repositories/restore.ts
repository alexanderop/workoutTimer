import { Context, Effect, Layer } from 'effect'
import type { TimerPreset, TimerSettings, WorkoutSession } from '../converters'
import type { DatabaseError } from '../errors'
import { db } from '../schema'
import { tryDb } from './shared'

/**
 * The one write that spans every table.
 *
 * Its own service rather than a method on one of the three, because that is
 * what it is: no table owns "replace the database", and hanging it off
 * `SessionsRepo` would make that service the place cross-table writes go by
 * default. The app already draws the same line — `restoreMutation` is the
 * write edge that invalidates all three reactivity keys, and it is the only
 * one that does.
 */
export class RestoreRepo extends Context.Service<
  RestoreRepo,
  {
    replaceAllData: (
      sessions: Array<WorkoutSession>,
      presets: Array<TimerPreset>,
      settings: TimerSettings,
    ) => Effect.Effect<void, DatabaseError>
  }
>()('workout-timer/db/RestoreRepo') {
  static readonly layer = Layer.effect(
    RestoreRepo,
    Effect.sync(() =>
      RestoreRepo.of({
        /**
         * Restores a backup by *replacing* what is on disk, not merging into
         * it. Merging looks harmless and is not: rows the user deleted before
         * exporting would survive the restore, so "import this backup" would
         * leave a database that never existed at any point in time — and a
         * backup containing an active session could land beside the existing
         * one, breaking the single-active-session invariant `createSession`
         * enforces transactionally. One transaction, so a failure halfway
         * leaves the old data intact rather than an empty app.
         */
        replaceAllData: Effect.fn('RestoreRepo.replaceAllData')(function* (
          sessions: Array<WorkoutSession>,
          presets: Array<TimerPreset>,
          settings: TimerSettings,
        ) {
          yield* tryDb('restore workout backup', () =>
            db.transaction('rw', db.sessions, db.presets, db.timerSettings, async () => {
              await db.sessions.clear()
              await db.presets.clear()
              await db.timerSettings.clear()
              await db.sessions.bulkAdd(sessions)
              await db.presets.bulkAdd(presets)
              await db.timerSettings.put(settings)
            }),
          )
        }),
      }),
    ),
  )
}

export const replaceAllData = (
  sessions: Array<WorkoutSession>,
  presets: Array<TimerPreset>,
  settings: TimerSettings,
) => RestoreRepo.use((repo) => repo.replaceAllData(sessions, presets, settings))
