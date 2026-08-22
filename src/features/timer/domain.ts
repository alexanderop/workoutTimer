import { FINISHED_STATUSES } from '@/db'
import type {
  CircuitBlock,
  SessionStatus,
  TimerConfig,
  TimerMode,
  TimerPreset,
  WorkoutSession,
} from '@/db'

export const SECOND_MS = 1_000
export const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

/** The schema's cap on circuit length, restated for form values like every bound here. */
export const MAX_CIRCUIT_BLOCKS = 30

/**
 * What a freshly added block holds, per kind. The default config below and the
 * editor's "add block" buttons both read these, so a new block matches what a
 * new circuit starts from.
 */
export const DEFAULT_CIRCUIT_BLOCKS = {
  work: { label: '', kind: 'work', durationMs: 30 * SECOND_MS },
  rest: { label: '', kind: 'rest', durationMs: 15 * SECOND_MS },
} satisfies Readonly<Record<CircuitBlock['kind'], CircuitBlock>>

/** Both block kinds, read off the defaults so the list cannot drift from them. */
export const CIRCUIT_BLOCK_KINDS =
  // SAFETY: the `satisfies` above checks DEFAULT_CIRCUIT_BLOCKS has exactly
  // the `CircuitBlock['kind']` keys, so those are its keys — `Object.keys` is
  // simply unable to say so.
  Object.keys(DEFAULT_CIRCUIT_BLOCKS) as ReadonlyArray<CircuitBlock['kind']>

export const DEFAULT_CONFIGS = {
  amrap: { mode: 'amrap', durationMs: 10 * MINUTE_MS },
  forTime: { mode: 'forTime' },
  emom: { mode: 'emom', intervalMs: MINUTE_MS, rounds: 10 },
  tabata: { mode: 'tabata', workMs: 20 * SECOND_MS, restMs: 10 * SECOND_MS, rounds: 8 },
  custom: {
    mode: 'custom',
    blocks: [DEFAULT_CIRCUIT_BLOCKS.work, DEFAULT_CIRCUIT_BLOCKS.rest],
    repeat: 3,
  },
} satisfies Readonly<Record<TimerMode, TimerConfig>>

/**
 * Every mode, in the order the home screen offers them.
 *
 * Read off `DEFAULT_CONFIGS` rather than written out again: that record is
 * keyed by `TimerMode`, so a new mode cannot compile without an entry, and
 * this list picks it up for free. Screens used to spell the four names inline,
 * which is how a fifth mode would have shipped invisible.
 */
export const TIMER_MODES =
  // SAFETY: as with CIRCUIT_BLOCK_KINDS — DEFAULT_CONFIGS `satisfies` a record
  // keyed by `TimerMode`, so those are its keys.
  Object.keys(DEFAULT_CONFIGS) as ReadonlyArray<TimerMode>

/** A route param is a string from the address bar: `undefined` means "not a mode". */
export function parseTimerMode(value: string | undefined): TimerMode | undefined {
  return TIMER_MODES.find((mode) => mode === value)
}

/**
 * Whether rounds are something the athlete taps rather than something the
 * clock counts. It is the same split `deriveTimer` makes when it fills
 * `completedRounds` — open-ended modes report tapped splits, structural modes
 * report finished work phases — so the run screen's "Add round" button is
 * offered by this rule rather than by a second list of mode names.
 */
export function capturesRoundSplits(mode: TimerMode): boolean {
  return mode === 'amrap' || mode === 'forTime'
}

/** `all`, or one of the ways a workout can be over. */
export type HistoryFilter = 'all' | SessionStatus

/**
 * The slices of history the screen offers, built off the schema's own list of
 * finished statuses — a vocabulary is a list, not a literal, and this one has
 * to agree with what `historySessionsAtom` filters by and with the
 * `history.<filter>` keys `historyFilterName` builds.
 */
export const HISTORY_FILTERS: ReadonlyArray<HistoryFilter> = ['all', ...FINISHED_STATUSES]

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
    case 'custom':
      return (
        config.blocks.length >= 1 &&
        config.blocks.length <= MAX_CIRCUIT_BLOCKS &&
        config.blocks.every((block) => isDuration(block.durationMs)) &&
        isCount(config.repeat)
      )
  }
}

/** One pass through a circuit's blocks, in milliseconds. */
export function circuitCycleMs(blocks: ReadonlyArray<CircuitBlock>): number {
  return blocks.reduce((sum, block) => sum + block.durationMs, 0)
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
    case 'custom':
      return circuitCycleMs(config.blocks) * config.repeat
  }
}

export type TimerPhase = 'countdown' | 'work' | 'rest' | 'finished'

export type DerivedTimer = {
  readonly elapsedMs: number
  readonly primaryMs: number
  readonly phase: TimerPhase
  /**
   * What the current circuit block is called, when it has a name. Only the
   * custom mode sets it — the run screen shows it in place of the generic
   * "Work"/"Rest" word, and it lives here because the screen may not switch
   * on the mode itself (the arch tier's V1 rule).
   */
  readonly phaseLabel?: string
  readonly round: number
  /**
   * Rounds actually finished, which is what result screens report: tapped
   * splits for AMRAP and For Time, work phases finished for EMOM and Tabata.
   * Distinct from `round` (the round the athlete is *in*), which in the
   * structural modes jumps to the configured count for any stored-final
   * session — even a cancelled one.
   */
  readonly completedRounds: number
  readonly totalRounds?: number
  readonly progress: number
  readonly isComplete: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Structural rounds finished after `elapsed`: a round counts once its work
 * phase ends, and adding the rest that follows each work phase moves that
 * boundary onto a cycle boundary. EMOM is the `restMs = 0` case.
 */
function structuralRoundsDone(
  elapsed: number,
  workMs: number,
  restMs: number,
  rounds: number,
): number {
  return Math.min(rounds, Math.floor((elapsed + restMs) / (workMs + restMs)))
}

/**
 * The block `withinCycle` milliseconds into a circuit's pass falls in, and how
 * far into that block. `undefined` past the end of the pass — the caller has
 * already ruled that out by handling completion first, so reaching it anyway
 * (an empty or damaged row) reads as finished rather than as a crash.
 */
function circuitPosition(
  blocks: ReadonlyArray<CircuitBlock>,
  withinCycle: number,
): { readonly block: CircuitBlock; readonly phaseElapsed: number } | undefined {
  let phaseElapsed = withinCycle
  for (const block of blocks) {
    if (phaseElapsed < block.durationMs) return { block, phaseElapsed }
    phaseElapsed -= block.durationMs
  }
  return undefined
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
      completedRounds: 0,
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
        completedRounds: session.rounds.length,
        progress: clamp(elapsed / session.config.durationMs, 0, 1),
        isComplete: complete,
      }
    }
    case 'forTime': {
      const cap = session.config.timeCapMs
      const cappedElapsed = cap === undefined ? elapsed : Math.min(elapsed, cap)
      // Stryker disable next-line ConditionalExpression: dropping the guard is
      // an equivalent mutant — `elapsed >= undefined` is false for every
      // elapsed, so an uncapped For Time never hits a cap either way. The
      // guard stays because it says so in the type, not because it changes the
      // result.
      const hitCap = cap !== undefined && elapsed >= cap
      const complete = completedInStorage || hitCap
      return {
        elapsedMs: cappedElapsed,
        primaryMs: cappedElapsed,
        phase: complete ? 'finished' : 'work',
        round: session.rounds.length,
        completedRounds: session.rounds.length,
        totalRounds: session.config.targetRounds,
        progress: cap === undefined ? 0 : clamp(elapsed / cap, 0, 1),
        isComplete: complete,
      }
    }
    case 'emom': {
      const total = session.config.intervalMs * session.config.rounds
      const cappedElapsed = Math.min(elapsed, total)
      const complete = completedInStorage || elapsed >= total
      const completedRounds = structuralRoundsDone(
        elapsed,
        session.config.intervalMs,
        0,
        session.config.rounds,
      )
      const withinRound = elapsed % session.config.intervalMs
      return {
        elapsedMs: cappedElapsed,
        primaryMs: complete ? 0 : session.config.intervalMs - withinRound,
        phase: complete ? 'finished' : 'work',
        round: complete ? session.config.rounds : completedRounds + 1,
        completedRounds,
        totalRounds: session.config.rounds,
        progress: complete ? 1 : clamp(withinRound / session.config.intervalMs, 0, 1),
        isComplete: complete,
      }
    }
    case 'tabata': {
      const total = totalDurationMs(session.config) ?? 0
      const cappedElapsed = Math.min(elapsed, total)
      const complete = completedInStorage || elapsed >= total
      const completedRounds = structuralRoundsDone(
        elapsed,
        session.config.workMs,
        session.config.restMs,
        session.config.rounds,
      )
      if (complete) {
        return {
          elapsedMs: cappedElapsed,
          primaryMs: 0,
          phase: 'finished',
          round: session.config.rounds,
          completedRounds,
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
        completedRounds,
        totalRounds: session.config.rounds,
        progress: clamp(phaseElapsed / Math.max(1, phaseDuration), 0, 1),
        isComplete: false,
      }
    }
    case 'custom': {
      const cycle = circuitCycleMs(session.config.blocks)
      const total = totalDurationMs(session.config) ?? 0
      const cappedElapsed = Math.min(elapsed, total)
      const roundIndex = Math.floor(elapsed / Math.max(1, cycle))
      // A repeat counts once its whole pass ends, so the boundary is the cycle.
      const completedRounds = Math.min(session.config.repeat, roundIndex)
      const complete = completedInStorage || elapsed >= total
      const position = complete
        ? undefined
        : circuitPosition(session.config.blocks, elapsed - roundIndex * cycle)
      if (position === undefined) {
        return {
          elapsedMs: cappedElapsed,
          primaryMs: 0,
          phase: 'finished',
          round: session.config.repeat,
          completedRounds,
          totalRounds: session.config.repeat,
          progress: 1,
          isComplete: true,
        }
      }

      const { block, phaseElapsed } = position
      return {
        elapsedMs: cappedElapsed,
        primaryMs: Math.max(0, block.durationMs - phaseElapsed),
        phase: block.kind,
        phaseLabel: block.label === '' ? undefined : block.label,
        round: Math.min(session.config.repeat, roundIndex + 1),
        completedRounds,
        totalRounds: session.config.repeat,
        progress: clamp(phaseElapsed / Math.max(1, block.durationMs), 0, 1),
        isComplete: false,
      }
    }
  }
}

/**
 * What a finished workout came to: `deriveTimer` frozen at the moment it
 * stopped. Screens that report a result rather than run one — history, the
 * detail page, the result page — all want this and all used to spell the
 * `finishedAt ?? Date.now()` fallback themselves. The fallback covers a row
 * that is somehow still open, which those screens can be pointed at by URL.
 */
export function finalResult(session: WorkoutSession, now: number = Date.now()): DerivedTimer {
  return deriveTimer(session, session.finishedAt ?? now)
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
