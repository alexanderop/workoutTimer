import { Result, Schema } from 'effect'
import type {
  PresetDraft,
  TimerConfig,
  TimerPreset,
  TimerSettings,
  WorkoutSession,
} from '@/types/workout'

const Timestamp = Schema.Natural
const Milliseconds = Schema.Natural
const Duration = Schema.Int.check(Schema.isBetween({ minimum: 1_000, maximum: 86_400_000 }))
const RestDuration = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 86_400_000 }))
const Count = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 999 }))
const StartCountdown = Schema.Literals([0, 3_000, 5_000, 10_000])

const AmrapConfigSchema = Schema.Struct({
  mode: Schema.Literal('amrap'),
  durationMs: Duration,
})

const ForTimeConfigSchema = Schema.Struct({
  mode: Schema.Literal('forTime'),
  timeCapMs: Schema.optionalKey(Duration),
  targetRounds: Schema.optionalKey(Count),
})

const EmomConfigSchema = Schema.Struct({
  mode: Schema.Literal('emom'),
  intervalMs: Duration,
  rounds: Count,
})

const TabataConfigSchema = Schema.Struct({
  mode: Schema.Literal('tabata'),
  workMs: Duration,
  restMs: RestDuration,
  rounds: Count,
})

const TimerConfigSchema = Schema.Union([
  AmrapConfigSchema,
  ForTimeConfigSchema,
  EmomConfigSchema,
  TabataConfigSchema,
])

const RoundSplitSchema = Schema.Struct({
  capturedAtElapsedMs: Milliseconds,
  reps: Schema.optionalKey(Count),
})

export const StoredTimerPresetSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  config: TimerConfigSchema,
  workoutNotes: Schema.String,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastUsedAt: Schema.optionalKey(Timestamp),
})

export type StoredTimerPreset = typeof StoredTimerPresetSchema.Type

export const StoredWorkoutSessionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  presetId: Schema.optionalKey(Schema.NonEmptyString),
  config: TimerConfigSchema,
  status: Schema.Literals(['countdown', 'running', 'paused', 'completed', 'cancelled']),
  workoutNotes: Schema.String,
  notes: Schema.String,
  countdownDurationMs: Milliseconds,
  startedAt: Timestamp,
  pauseStartedAt: Schema.optionalKey(Timestamp),
  accumulatedPausedMs: Milliseconds,
  finishedAt: Schema.optionalKey(Timestamp),
  finishReason: Schema.optionalKey(Schema.Literals(['endpoint', 'manual', 'timeCap', 'cancelled'])),
  rounds: Schema.Array(RoundSplitSchema),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})

export type StoredWorkoutSession = typeof StoredWorkoutSessionSchema.Type

export const StoredTimerSettingsSchema = Schema.Struct({
  id: Schema.Literal('timer'),
  soundEnabled: Schema.Boolean,
  hapticsEnabled: Schema.Boolean,
  spokenCountdownEnabled: Schema.Boolean,
  startCountdownMs: StartCountdown,
  keepAwake: Schema.Boolean,
  updatedAt: Timestamp,
})

export type StoredTimerSettings = typeof StoredTimerSettingsSchema.Type

const PresetDraftSchema = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  config: TimerConfigSchema,
  workoutNotes: Schema.Trim,
})

const NewSessionSchema = Schema.Struct({
  config: TimerConfigSchema,
  presetId: Schema.optionalKey(Schema.NonEmptyString),
  workoutNotes: Schema.Trim,
  countdownDurationMs: StartCountdown,
})

export const decodeStoredTimerPreset = Schema.decodeUnknownEffect(StoredTimerPresetSchema)
export const decodeStoredWorkoutSession = Schema.decodeUnknownEffect(StoredWorkoutSessionSchema)
export const decodeStoredTimerSettings = Schema.decodeUnknownEffect(StoredTimerSettingsSchema)
export const decodePresetDraft = Schema.decodeUnknownEffect(PresetDraftSchema)
export const decodeNewSession = Schema.decodeUnknownEffect(NewSessionSchema)

export function toTimerPreset(stored: StoredTimerPreset): TimerPreset {
  return { ...stored, config: stored.config as TimerConfig }
}

export function toWorkoutSession(stored: StoredWorkoutSession): WorkoutSession {
  return {
    ...stored,
    config: stored.config as TimerConfig,
    rounds: stored.rounds.map((round) => ({ ...round })),
  }
}

export function toTimerSettings(stored: StoredTimerSettings): TimerSettings {
  return { ...stored }
}

const parsePresetDraft = Schema.decodeUnknownResult(PresetDraftSchema)
export const isPresetDraft = (draft: PresetDraft): boolean =>
  Result.isSuccess(parsePresetDraft(draft))

export function makeDefaultTimerSettings(now: number): TimerSettings {
  return {
    id: 'timer',
    soundEnabled: true,
    hapticsEnabled: true,
    spokenCountdownEnabled: false,
    startCountdownMs: 3_000,
    keepAwake: true,
    updatedAt: now,
  }
}
