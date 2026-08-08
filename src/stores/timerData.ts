import { Atom } from '@effect/atom-vue'
import { Effect } from 'effect'
import {
  dbRuntime,
  getTimerSettings,
  listPresets,
  listSessions,
  PRESETS_KEY,
  SESSIONS_KEY,
  SETTINGS_KEY,
} from '@/db'

const reportReadFailure = (boundary: string, operation: string) =>
  Effect.tapError((error: unknown) =>
    Effect.logError(error).pipe(
      Effect.annotateLogs({ boundary, operation, failure: 'Db.DatabaseError' }),
    ),
  )

export const sessionsAtom = dbRuntime
  .atom(listSessions.pipe(reportReadFailure('sessions', 'load sessions')))
  .pipe(Atom.withReactivity([SESSIONS_KEY]))

export const presetsAtom = dbRuntime
  .atom(listPresets.pipe(reportReadFailure('presets', 'load presets')))
  .pipe(Atom.withReactivity([PRESETS_KEY]))

export const timerSettingsAtom = dbRuntime
  .atom(getTimerSettings.pipe(reportReadFailure('settings', 'load timer settings')))
  .pipe(Atom.withReactivity([SETTINGS_KEY]))
