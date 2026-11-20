import type { TimerMode } from '@/db'
import {
  capturesRoundSplits,
  MINUTE_MS,
  SECOND_MS,
  type DerivedTimer,
} from '@/features/timer/domain'

/** How many "Round N" clips ship in `public/voice`; later rounds fall back to "Go". */
const SPOKEN_ROUNDS = 20

const ROUND_CUES = Array.from(
  { length: SPOKEN_ROUNDS },
  (_, index) => `round-${index + 1}` as const,
)

/** One entry per file in `public/voice` — the loader fetches exactly this list. */
export const VOICE_CUES = [
  'get-ready',
  'go',
  'rest',
  'halfway',
  'one-minute',
  'ten-seconds',
  'three',
  'two',
  'one',
  'last-round',
  'complete',
  ...ROUND_CUES,
] as const

export type VoiceCue = (typeof VOICE_CUES)[number]

/** The clip for a 3-2-1 tick. */
export function countdownVoiceCue(second: number): VoiceCue | undefined {
  if (second === 3) return 'three'
  if (second === 2) return 'two'
  return second === 1 ? 'one' : undefined
}

/** A phase shorter than this never hears "Halfway": it would land on the ten-second call. */
const HALFWAY_MIN_MS = 40 * SECOND_MS
/** "One minute left" only where a minute is the home stretch, not half the phase. */
const ONE_MINUTE_MIN_MS = 3 * MINUTE_MS
/** A 10-second rest starts at ten seconds — announcing it would talk over "Rest". */
const TEN_SECONDS_MIN_MS = 20 * SECOND_MS
/** A longer start countdown than this has room for "Get ready" before the 3-2-1. */
const GET_READY_MIN_MS = 4 * SECOND_MS

/**
 * The full length of the phase `state` is in, recovered from what is left of
 * it and how far through it is. Rounded to the second because `progress` is a
 * ratio of two clock readings.
 */
function phaseDurationMs(remainingMs: number, progress: number): number | undefined {
  if (progress >= 1) return undefined
  return Math.round(remainingMs / (1 - progress) / SECOND_MS) * SECOND_MS
}

function workStartCue(previous: DerivedTimer, state: DerivedTimer, mode: TimerMode): VoiceCue {
  if (capturesRoundSplits(mode) || state.totalRounds === undefined) return 'go'
  // A circuit can hold several work blocks per pass: only the first is a round.
  const startsRound = previous.phase === 'countdown' || previous.round !== state.round
  if (!startsRound) return 'go'
  if (state.totalRounds > 1 && state.round === state.totalRounds) return 'last-round'
  return ROUND_CUES[state.round - 1] ?? 'go'
}

/**
 * What the coach says as the timer moves from `previous` to `state`, if
 * anything. At most one line per tick, and never one that overlaps another:
 * the thresholds above keep "Halfway", "One minute left" and "Ten seconds"
 * apart from each other and from the phase announcements.
 *
 * The 3-2-1 and the finish are not here — the driver already owns those
 * moments and hands them their clips directly.
 */
export function voiceCueFor(
  previous: DerivedTimer | undefined,
  state: DerivedTimer,
  mode: TimerMode,
): VoiceCue | undefined {
  if (state.phase === 'finished') return undefined
  if (previous === undefined) {
    return state.phase === 'countdown' && (state.remainingMs ?? 0) > GET_READY_MIN_MS
      ? 'get-ready'
      : undefined
  }

  if (previous.phase !== state.phase) {
    return state.phase === 'rest' ? 'rest' : workStartCue(previous, state, mode)
  }
  if (previous.round !== state.round) {
    // In AMRAP and For Time a new round is a tap, which cues itself.
    return capturesRoundSplits(mode) ? undefined : workStartCue(previous, state, mode)
  }

  // `remainingMs`, not `primaryMs`: For Time counts up, and uncapped it has no
  // boundary to count towards at all.
  const before = previous.remainingMs
  const left = state.remainingMs
  if (state.phase === 'countdown' || before === undefined || left === undefined) return undefined
  const duration = phaseDurationMs(left, state.progress)
  if (duration === undefined) return undefined
  const crossed = (thresholdMs: number): boolean => before > thresholdMs && left <= thresholdMs

  if (duration >= HALFWAY_MIN_MS && crossed(duration / 2)) return 'halfway'
  if (duration >= ONE_MINUTE_MIN_MS && crossed(MINUTE_MS)) return 'one-minute'
  if (duration >= TEN_SECONDS_MIN_MS && crossed(10 * SECOND_MS)) return 'ten-seconds'
  return undefined
}
