import { AsyncResult, Atom, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import {
  dbRuntime,
  getTimerSettings,
  listPresets,
  listSessions,
  makeDefaultTimerSettings,
  PRESETS_KEY,
  SESSIONS_KEY,
  SETTINGS_KEY,
  type TimerPreset,
  type TimerSettings,
  type WorkoutSession,
} from '@/db'

/**
 * The read side of the database, as three atoms and the composables that read
 * them.
 *
 * Subscribing *is* the load: `dbRuntime.atom` runs its program on first
 * subscription, and `Atom.withReactivity` re-runs it whenever a mutation atom
 * invalidates the matching key. There is no `onMounted` fetch and nothing that
 * has to remember to re-read after a write.
 *
 * The atoms are module-private on purpose. An `AsyncResult` is a three-state
 * value, and every component that unwrapped one by hand wrote the same
 * `getOrElse(…, () => [])` line — including, twice, a hand-written copy of the
 * default settings row that had to be patched by hand when db v2 added
 * `soundVolume`. `readAtom` is the one place that unwrapping happens, and the
 * fallback for settings is the same constructor the repository seeds a fresh
 * database with.
 */

const reportReadFailure = (boundary: string, operation: string) =>
  Effect.tapError((error: unknown) =>
    Effect.logError(error).pipe(
      Effect.annotateLogs({ boundary, operation, failure: 'Db.DatabaseError' }),
    ),
  )

const sessionsAtom = dbRuntime
  .atom(listSessions.pipe(reportReadFailure('sessions', 'load sessions')))
  .pipe(Atom.withReactivity([SESSIONS_KEY]))

const presetsAtom = dbRuntime
  .atom(listPresets.pipe(reportReadFailure('presets', 'load presets')))
  .pipe(Atom.withReactivity([PRESETS_KEY]))

const timerSettingsAtom = dbRuntime
  .atom(getTimerSettings.pipe(reportReadFailure('settings', 'load timer settings')))
  .pipe(Atom.withReactivity([SETTINGS_KEY]))

/**
 * One table's rows, plus the two questions a screen asks about the read.
 *
 * `failed` drives the "your data could not be loaded" panel. `settled` is the
 * narrower one — false only while a read is still in flight — and exists for
 * the setup form, which must not treat "this preset is not here" as final
 * until the presets have actually arrived.
 */
export interface TableRead<A> {
  readonly data: ComputedRef<A>
  readonly failed: ComputedRef<boolean>
  readonly settled: ComputedRef<boolean>
}

function readAtom<A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>, empty: () => A) {
  const result = useAtomValue(() => atom)

  return {
    data: computed(() => AsyncResult.getOrElse(result.value, empty)),
    failed: computed(() => AsyncResult.isFailure(result.value)),
    settled: computed(() => !AsyncResult.isWaiting(result.value)),
  }
}

const noSessions = (): Array<WorkoutSession> => []
const noPresets = (): Array<TimerPreset> => []

export function useSessions(): TableRead<Array<WorkoutSession>> {
  return readAtom(sessionsAtom, noSessions)
}

export function usePresets(): TableRead<Array<TimerPreset>> {
  return readAtom(presetsAtom, noPresets)
}

/**
 * Timer preferences, with the seeded defaults standing in until the row
 * arrives. `updatedAt: 0` is what marks the stand-in as never-written.
 */
export function useTimerSettings(): TableRead<TimerSettings> {
  return readAtom(timerSettingsAtom, () => makeDefaultTimerSettings(0))
}

/**
 * The session a `/session/:id` route is about. `undefined` covers both "still
 * loading" and "no such workout" — the screens that use it show the same
 * "could not be found" panel for either, and the row turning up later swaps
 * the panel for the workout.
 */
export function useSession(id: MaybeRefOrGetter<string>): ComputedRef<WorkoutSession | undefined> {
  const { data } = useSessions()

  return computed(() => data.value.find((session) => session.id === toValue(id)))
}
