import { Clock, Context, Effect, Layer } from 'effect'
import {
  decodeTimerSettings,
  decodeTimerSettingsSync,
  makeDefaultTimerSettings,
} from '../converters'
import type { TimerSettings } from '../converters'
import type { DatabaseError } from '../errors'
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

        /**
         * A patch, applied to whatever is on disk right now.
         *
         * Read, merge and write happen in one transaction, for the reason
         * `changeSession` opens one in `./sessions.ts`: the row cannot move
         * between the read and the write. Two settings writes really can
         * overlap — `settingsMutation` is `concurrent: true`, and the settings
         * screen has half a dozen controls that each fire one — and reading
         * outside the transaction means both fibers merge their patch into the
         * same `current` and the second `put` drops the first. No error, no
         * conflict: the preference simply does not stick.
         *
         * The decode inside is the sync one because a transaction callback
         * cannot `yield*`; leaving the transaction to validate would put the
         * gap straight back. A `SchemaError` thrown in there is caught by
         * `tryDb` and arrives as a `DatabaseError` carrying it.
         */
        updateSettings: Effect.fn('SettingsRepo.updateSettings')(function* (
          patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>,
        ) {
          const now = yield* Clock.currentTimeMillis
          return yield* tryDb('update timer settings', () =>
            db.transaction('rw', db.timerSettings, async () => {
              const stored = await db.timerSettings.get(SETTINGS_ROW_ID)
              const current =
                stored === undefined
                  ? makeDefaultTimerSettings(now)
                  : decodeTimerSettingsSync(stored)
              const next: TimerSettings = {
                ...current,
                ...patch,
                id: SETTINGS_ROW_ID,
                updatedAt: now,
              }
              // The decoded row, not the one handed to the decoder: they agree
              // today, and storing the value that was actually validated is
              // what keeps them agreeing if the schema grows a decoding
              // default.
              const validated = decodeTimerSettingsSync(next)
              await db.timerSettings.put(validated)
              return validated
            }),
          )
        }),
      }),
    ),
  )
}

export const getTimerSettings = SettingsRepo.use((repo) => repo.getSettings())
export const updateTimerSettings = (patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>) =>
  SettingsRepo.use((repo) => repo.updateSettings(patch))
