export {
  dbRuntime,
  PRESETS_KEY,
  presetMutation,
  restoreMutation,
  SESSIONS_KEY,
  sessionMutation,
  SETTINGS_KEY,
  settingsMutation,
  workoutStartMutation,
} from './atoms'
export { exportData, importData } from './backup'
// ACTIVE_STATUSES and SESSION_STATUSES stay internal: the app asks the
// predicates, and the lists themselves are for the repository's index lookup
// and for the specs that walk every status.
export {
  DEFAULT_TIMER_SETTINGS,
  FINISHED_STATUSES,
  isActiveSession,
  isFinishedSession,
  isPresetDraft,
  START_COUNTDOWN_OPTIONS,
} from './converters'
export type {
  CircuitBlock,
  FinishReason,
  NewSession,
  PresetDraft,
  SessionStatus,
  StartCountdownMs,
  TimerConfig,
  TimerMode,
  TimerPreset,
  TimerSettings,
  WorkoutSession,
} from './converters'
export { DatabaseError } from './errors'
// The services a program handed to a mutation atom may require. Exported so a
// module outside src/db can *name* that contract — src/features/timer/runDriver.ts
// composes such a program — without reaching into src/db/layer.ts.
export type { DbServices } from './layer'
// One repository per aggregate — the same division the mutation atoms above
// already make. Callers name the operation, never the service behind it.
export { createPreset, deletePreset, listPresets, updatePreset } from './repositories/presets'
export {
  addSessionRound,
  createSession,
  deleteSession,
  finishSession,
  listSessions,
  markSessionRunning,
  pauseSession,
  resumeSession,
  updateSessionNotes,
} from './repositories/sessions'
export { getTimerSettings, updateTimerSettings } from './repositories/settings'
export { runDb } from './runtime'
export { resetDatabase } from './schema'
