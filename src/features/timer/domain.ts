import type { TimerConfig, TimerMode, TimerPreset, WorkoutSession } from '@/types/workout'

export const SECOND_MS = 1_000
export const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

export const DEFAULT_CONFIGS: Readonly<Record<TimerMode, TimerConfig>> = {
  amrap: { mode: 'amrap', durationMs: 10 * MINUTE_MS },
  forTime: { mode: 'forTime' },
  emom: { mode: 'emom', intervalMs: MINUTE_MS, rounds: 10 },
  tabata: { mode: 'tabata', workMs: 20 * SECOND_MS, restMs: 10 * SECOND_MS, rounds: 8 },
}

const MAX_DURATION_MS = 24 * HOUR_MS

function isDuration(value: number): boolean {
  return Number.isSafeInteger(value) && value >= SECOND_MS && value <= MAX_DURATION_MS
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 999
}

export function isTimerConfig(config: TimerConfig): boolean {
  switch (config.mode) {
    case 'amrap':
      return isDuration(config.durationMs)
    case 'forTime':
      return (
        (config.timeCapMs === undefined || isDuration(config.timeCapMs)) &&
        (config.targetRounds === undefined || isCount(config.targetRounds))
      )
    case 'emom':
      return isDuration(config.intervalMs) && isCount(config.rounds)
    case 'tabata':
      return (
        isDuration(config.workMs) &&
        Number.isSafeInteger(config.restMs) &&
        config.restMs >= 0 &&
        config.restMs <= MAX_DURATION_MS &&
        isCount(config.rounds)
      )
  }
}

export function totalDurationMs(config: TimerConfig): number | undefined {
  switch (config.mode) {
    case 'amrap':
      return config.durationMs
    case 'forTime':
      return config.timeCapMs
    case 'emom':
      return config.intervalMs * config.rounds
    case 'tabata':
      return config.workMs * config.rounds + config.restMs * Math.max(0, config.rounds - 1)
  }
}

type TimerPhase = 'countdown' | 'work' | 'rest' | 'finished'

export type DerivedTimer = {
  readonly elapsedMs: number
  readonly primaryMs: number
  readonly phase: TimerPhase
  readonly round: number
  readonly totalRounds?: number
  readonly progress: number
  readonly isComplete: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function elapsedSessionMs(session: WorkoutSession, now: number): number {
  const effectiveNow =
    session.status === 'paused'
      ? (session.pauseStartedAt ?? now)
      : session.status === 'completed' || session.status === 'cancelled'
        ? (session.finishedAt ?? now)
        : now

  return Math.max(0, effectiveNow - session.startedAt - session.accumulatedPausedMs)
}

export function deriveTimer(session: WorkoutSession, now: number): DerivedTimer {
  if (now < session.startedAt && session.status === 'countdown') {
    const remaining = session.startedAt - now
    return {
      elapsedMs: 0,
      primaryMs: remaining,
      phase: 'countdown',
      round: 0,
      progress: clamp(1 - remaining / Math.max(1, session.countdownDurationMs), 0, 1),
      isComplete: false,
    }
  }

  const elapsed = elapsedSessionMs(session, now)
  const completedInStorage = session.status === 'completed' || session.status === 'cancelled'

  switch (session.config.mode) {
    case 'amrap': {
      const remaining = Math.max(0, session.config.durationMs - elapsed)
      const complete = completedInStorage || elapsed >= session.config.durationMs
      return {
        elapsedMs: Math.min(elapsed, session.config.durationMs),
        primaryMs: remaining,
        phase: complete ? 'finished' : 'work',
        round: session.rounds.length,
        progress: clamp(elapsed / session.config.durationMs, 0, 1),
        isComplete: complete,
      }
    }
    case 'forTime': {
      const cap = session.config.timeCapMs
      const cappedElapsed = cap === undefined ? elapsed : Math.min(elapsed, cap)
      const hitCap = cap !== undefined && elapsed >= cap
      const complete = completedInStorage || hitCap
      return {
        elapsedMs: cappedElapsed,
        primaryMs: cappedElapsed,
        phase: complete ? 'finished' : 'work',
        round: session.rounds.length,
        totalRounds: session.config.targetRounds,
        progress: cap === undefined ? 0 : clamp(elapsed / cap, 0, 1),
        isComplete: complete,
      }
    }
    case 'emom': {
      const total = session.config.intervalMs * session.config.rounds
      const cappedElapsed = Math.min(elapsed, total)
      const complete = completedInStorage || elapsed >= total
      const round = complete
        ? session.config.rounds
        : Math.min(session.config.rounds, Math.floor(elapsed / session.config.intervalMs) + 1)
      const withinRound = elapsed % session.config.intervalMs
      return {
        elapsedMs: cappedElapsed,
        primaryMs: complete ? 0 : session.config.intervalMs - withinRound,
        phase: complete ? 'finished' : 'work',
        round,
        totalRounds: session.config.rounds,
        progress: complete ? 1 : clamp(withinRound / session.config.intervalMs, 0, 1),
        isComplete: complete,
      }
    }
    case 'tabata': {
      const total = totalDurationMs(session.config) ?? 0
      const cappedElapsed = Math.min(elapsed, total)
      const complete = completedInStorage || elapsed >= total
      if (complete) {
        return {
          elapsedMs: cappedElapsed,
          primaryMs: 0,
          phase: 'finished',
          round: session.config.rounds,
          totalRounds: session.config.rounds,
          progress: 1,
          isComplete: true,
        }
      }

      const cycle = session.config.workMs + session.config.restMs
      const roundIndex = Math.floor(elapsed / cycle)
      const withinCycle = elapsed - roundIndex * cycle
      const resting = withinCycle >= session.config.workMs
      const phaseDuration = resting ? session.config.restMs : session.config.workMs
      const phaseElapsed = resting ? withinCycle - session.config.workMs : withinCycle

      return {
        elapsedMs: cappedElapsed,
        primaryMs: Math.max(0, phaseDuration - phaseElapsed),
        phase: resting ? 'rest' : 'work',
        round: Math.min(session.config.rounds, roundIndex + 1),
        totalRounds: session.config.rounds,
        progress: clamp(phaseElapsed / Math.max(1, phaseDuration), 0, 1),
        isComplete: false,
      }
    }
  }
}

export function formatDuration(milliseconds: number, showTenths = false): string {
  const safe = Math.max(0, milliseconds)
  const totalSeconds = Math.floor(safe / SECOND_MS)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const base =
    hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return showTenths ? `${base}.${Math.floor((safe % SECOND_MS) / 100)}` : base
}

export function sortPresets(presets: ReadonlyArray<TimerPreset>): Array<TimerPreset> {
  return [...presets].sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt))
}

export function sortSessions(sessions: ReadonlyArray<WorkoutSession>): Array<WorkoutSession> {
  return [...sessions].sort((a, b) => b.createdAt - a.createdAt)
}
