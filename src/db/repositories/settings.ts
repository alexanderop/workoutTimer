import { Clock, Context, Effect, Layer } from 'effect'
import { decodeTimerSettings, makeDefaultTimerSettings } from '../converters'
import type { TimerSettings } from '../converters'
import { DatabaseError } from '../errors'
import { db } from '../schema'
import { decodeRow, tryDb } from './shared'

const SETTINGS_ROW_ID = 'timer'

const decodeSettingsRow = decodeRow('decode settings row', decodeTimerSettings)

/**
 * Timer preferences: one row, which may not exist yet.
 *
 * "May not exist yet" is the whole of this repository's difficulty, and it is
 * why `getSettings` answers with the defaults rather than `undefined` — a
 * first run has preferences, they are simply the ones nobody has changed.
 */
export class SettingsRepo extends Context.Service<
  SettingsRepo,
  {
    getSettings: () => Effect.Effect<TimerSettings, DatabaseError>
    updateSettings: (
      patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>,
    ) => Effect.Effect<TimerSettings, DatabaseError>
  }
>()('workout-timer/db/SettingsRepo') {
  static readonly layer = Layer.effect(
    SettingsRepo,
    Effect.sync(() =>
      SettingsRepo.of({
        getSettings: Effect.fn('SettingsRepo.getSettings')(function* () {
          const row = yield* tryDb('get timer settings', () =>
            db.timerSettings.get(SETTINGS_ROW_ID),
          )
          if (row === undefined) {
            return makeDefaultTimerSettings(yield* Clock.currentTimeMillis)
          }
          return yield* decodeSettingsRow(row)
        }),

        updateSettings: Effect.fn('SettingsRepo.updateSettings')(function* (
          patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>,
        ) {
          const now = yield* Clock.currentTimeMillis
          const currentRow = yield* tryDb('get timer settings for update', () =>
            db.timerSettings.get(SETTINGS_ROW_ID),
          )
          const current =
            currentRow === undefined
              ? makeDefaultTimerSettings(now)
              : yield* decodeSettingsRow(currentRow)
          const next: TimerSettings = { ...current, ...patch, id: SETTINGS_ROW_ID, updatedAt: now }
          const validated = yield* decodeTimerSettings(next).pipe(
            Effect.mapError(
              (cause) => new DatabaseError({ operation: 'validate timer settings', cause }),
            ),
          )
          yield* tryDb('update timer settings', async () => db.timerSettings.put(validated))
          // The decoded row, not the one handed to the decoder: they agree
          // today, and returning the value that was actually stored is what
          // keeps them agreeing if the schema grows a decoding default.
          return validated
        }),
      }),
    ),
  )
}

export const getTimerSettings = SettingsRepo.use((repo) => repo.getSettings())
export const updateTimerSettings = (patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>) =>
  SettingsRepo.use((repo) => repo.updateSettings(patch))
