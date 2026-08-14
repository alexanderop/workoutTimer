import { AsyncResult, Atom } from '@effect/atom-vue'
import { Effect } from 'effect'
import {
  dbRuntime,
  DEFAULT_TIMER_SETTINGS,
  getTimerSettings,
  listPresets,
  listSessions,
  PRESETS_KEY,
  SESSIONS_KEY,
  SETTINGS_KEY,
  type TimerPreset,
  type TimerSettings,
  type WorkoutSession,
} from '@/db'

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
 * The unwrapped reads.
 *
 * Every screen wants the rows, and treats "still loading" and "failed" as the
 * same empty list — the failure is surfaced separately by the `*LoadFailedAtom`
 * flags below. That unwrapping used to be a `computed` repeated verbatim in
 * seven views; it is a property of the data, so it lives beside the data.
 *
 * Derivations that need the timer *domain* (sorting, `deriveTimer`) are not
 * here: `src/state/` is a shared layer and may not import a feature. They
 * live in `src/features/timer/atoms.ts`, built on these.
 */
export const sessionListAtom = Atom.map(
  sessionsAtom,
  AsyncResult.getOrElse((): ReadonlyArray<WorkoutSession> => []),
)

export const presetListAtom = Atom.map(
  presetsAtom,
  AsyncResult.getOrElse((): ReadonlyArray<TimerPreset> => []),
)

export const timerSettingsValueAtom = Atom.map(
  timerSettingsAtom,
  AsyncResult.getOrElse((): TimerSettings => DEFAULT_TIMER_SETTINGS),
)

export const sessionsLoadFailedAtom = Atom.map(sessionsAtom, AsyncResult.isFailure)

export const presetsLoadFailedAtom = Atom.map(presetsAtom, AsyncResult.isFailure)
