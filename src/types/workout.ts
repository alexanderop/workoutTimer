const TIMER_MODES = ['amrap', 'forTime', 'emom', 'tabata'] as const

export type TimerMode = (typeof TIMER_MODES)[number]

type AmrapConfig = {
  readonly mode: 'amrap'
  readonly durationMs: number
}

type ForTimeConfig = {
  readonly mode: 'forTime'
  readonly timeCapMs?: number
  readonly targetRounds?: number
}

type EmomConfig = {
  readonly mode: 'emom'
  readonly intervalMs: number
  readonly rounds: number
}

type TabataConfig = {
  readonly mode: 'tabata'
  readonly workMs: number
  readonly restMs: number
  readonly rounds: number
}

export type TimerConfig = AmrapConfig | ForTimeConfig | EmomConfig | TabataConfig

export type SessionStatus = 'countdown' | 'running' | 'paused' | 'completed' | 'cancelled'

type FinishReason = 'endpoint' | 'manual' | 'timeCap' | 'cancelled'

type RoundSplit = {
  readonly capturedAtElapsedMs: number
  readonly reps?: number
}

export type TimerPreset = {
  readonly id: string
  readonly name: string
  readonly config: TimerConfig
  readonly workoutNotes: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly lastUsedAt?: number
}

export type WorkoutSession = {
  readonly id: string
  readonly presetId?: string
  readonly config: TimerConfig
  readonly status: SessionStatus
  readonly workoutNotes: string
  readonly notes: string
  readonly countdownDurationMs: number
  readonly startedAt: number
  readonly pauseStartedAt?: number
  readonly accumulatedPausedMs: number
  readonly finishedAt?: number
  readonly finishReason?: FinishReason
  readonly rounds: ReadonlyArray<RoundSplit>
  readonly createdAt: number
  readonly updatedAt: number
}

export type TimerSettings = {
  readonly id: 'timer'
  readonly soundEnabled: boolean
  readonly hapticsEnabled: boolean
  readonly spokenCountdownEnabled: boolean
  readonly startCountdownMs: 0 | 3_000 | 5_000 | 10_000
  readonly keepAwake: boolean
  readonly updatedAt: number
}

export type NewSession = {
  readonly config: TimerConfig
  readonly presetId?: string
  readonly workoutNotes: string
  readonly countdownDurationMs: 0 | 3_000 | 5_000 | 10_000
}

export type PresetDraft = {
  readonly name: string
  readonly config: TimerConfig
  readonly workoutNotes: string
}
