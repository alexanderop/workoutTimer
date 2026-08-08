import { Effect, Result, Schema } from 'effect'

/**
 * What a workout *is*, defined once as a Schema.
 *
 * This module owns every shape the app persists; `schema.ts` owns the Dexie
 * tables and imports the types from here. Dexie's table typing, the read-path
 * decode in the repository, and backup validation all derive from these
 * declarations, so they cannot drift apart the way a hand-written type and a
 * hand-written schema silently do. The domain names the rest of the app uses
 * (`TimerConfig`, `WorkoutSession`, …) are the schemas' own decoded types —
 * there is no second, hand-maintained copy of them anywhere.
 */

/**
 * Epoch milliseconds — a non-negative safe integer, which is exactly what
 * `Date.now()` and `Clock.currentTimeMillis` return. `Schema.Number` would
 * accept `NaN` and `±Infinity`, and a row with `startedAt: NaN` decodes
 * cleanly and then poisons every comparison downstream. IndexedDB is
 * untrusted input, so this is a rule the schema enforces rather than an
 * assumption its readers make.
 */
const Timestamp = Schema.Natural
const Milliseconds = Schema.Natural
const Duration = Schema.Int.check(Schema.isBetween({ minimum: 1_000, maximum: 86_400_000 }))
const RestDuration = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 86_400_000 }))
const Count = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 999 }))
const StartCountdown = Schema.Literals([0, 3_000, 5_000, 10_000])

/**
 * Cue gain, 0 (silent) to 1 (full scale). Rows written before db v2 lack the
 * key, and so do backups exported from those versions — the decoding default
 * is the tolerant read path that keeps both readable, while the domain type
 * stays complete. Defaults to full volume: the fixed gain it replaced was too
 * quiet on phone speakers.
 */
const SoundVolume = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed(1)),
)

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

/**
 * Exported because `isTimerConfig` in the timer domain restates these bounds by
 * hand — it has to, since it grades a form's in-progress value rather than a
 * decoded row. Two statements of one rule drift, so the unit tier holds them
 * against each other as a property; this export is what it holds them against.
 */
export const TimerConfigSchema = Schema.Union([
  AmrapConfigSchema,
  ForTimeConfigSchema,
  EmomConfigSchema,
  TabataConfigSchema,
])

/** A union, so this is a `type` — the `interface … extends` idiom below only fits structs. */
export type TimerConfig = typeof TimerConfigSchema.Type

/** Derived from the configs rather than restated, so a new mode cannot be forgotten here. */
export type TimerMode = TimerConfig['mode']

const RoundSplitSchema = Schema.Struct({
  capturedAtElapsedMs: Milliseconds,
  reps: Schema.optionalKey(Count),
})

export const TimerPresetSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  config: TimerConfigSchema,
  workoutNotes: Schema.String,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastUsedAt: Schema.optionalKey(Timestamp),
})

export interface TimerPreset extends Schema.Schema.Type<typeof TimerPresetSchema> {}

export const WorkoutSessionSchema = Schema.Struct({
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

export interface WorkoutSession extends Schema.Schema.Type<typeof WorkoutSessionSchema> {}

export type SessionStatus = WorkoutSession['status']
export type FinishReason = 'endpoint' | 'manual' | 'timeCap' | 'cancelled'

export const TimerSettingsSchema = Schema.Struct({
  id: Schema.Literal('timer'),
  soundEnabled: Schema.Boolean,
  soundVolume: SoundVolume,
  hapticsEnabled: Schema.Boolean,
  spokenCountdownEnabled: Schema.Boolean,
  startCountdownMs: StartCountdown,
  keepAwake: Schema.Boolean,
  updatedAt: Timestamp,
})

export interface TimerSettings extends Schema.Schema.Type<typeof TimerSettingsSchema> {}

/**
 * Drafts are what a component hands *in*, before validation — so their types
 * come from the schemas' Encoded side. `Schema.Trim`'s decoded type is the
 * trimmed string; its encoded type is the raw one the textarea actually holds.
 */
const PresetDraftSchema = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  config: TimerConfigSchema,
  workoutNotes: Schema.Trim,
})

export type PresetDraft = typeof PresetDraftSchema.Encoded

const NewSessionSchema = Schema.Struct({
  config: TimerConfigSchema,
  presetId: Schema.optionalKey(Schema.NonEmptyString),
  workoutNotes: Schema.Trim,
  countdownDurationMs: StartCountdown,
})

export type NewSession = typeof NewSessionSchema.Encoded

/**
 * Validates one untrusted row. IndexedDB is not a trusted store: rows survive
 * app versions, get restored with a profile, and are editable from devtools,
 * so what comes back is `unknown` no matter what the table's TypeScript type
 * claims.
 */
export const decodeTimerPreset = Schema.decodeUnknownEffect(TimerPresetSchema)
export const decodeWorkoutSession = Schema.decodeUnknownEffect(WorkoutSessionSchema)
export const decodeTimerSettings = Schema.decodeUnknownEffect(TimerSettingsSchema)
export const decodePresetDraft = Schema.decodeUnknownEffect(PresetDraftSchema)
export const decodeNewSession = Schema.decodeUnknownEffect(NewSessionSchema)

const parsePresetDraft = Schema.decodeUnknownResult(PresetDraftSchema)
export const isPresetDraft = (draft: PresetDraft): boolean =>
  Result.isSuccess(parsePresetDraft(draft))

export function makeDefaultTimerSettings(now: number): TimerSettings {
  return {
    id: 'timer',
    soundEnabled: true,
    soundVolume: 1,
    hapticsEnabled: true,
    spokenCountdownEnabled: false,
    startCountdownMs: 3_000,
    keepAwake: true,
    updatedAt: now,
  }
}
