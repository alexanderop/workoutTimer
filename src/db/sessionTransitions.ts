import { isFinishedSession } from './converters'
import type { FinishReason, WorkoutSession } from './converters'

/**
 * What a workout row becomes when something happens to it.
 *
 * These were five read-modify-write blocks inside the repository's Dexie
 * transactions, which put the only interesting arithmetic in the app — how
 * paused time accumulates — somewhere the Node tier could not reach. They are
 * pure now: the repository reads the row, hands it here, and stores whatever
 * comes back.
 *
 * **`undefined` means "leave it alone", not "that failed."** Every one of
 * these can be asked for a transition the row is past — a pause tapped as the
 * clock runs out, a finish that raced the automatic one — and the honest
 * answer is that there is nothing to write. The repository reports that back
 * up as `false` rather than as an error, because the caller only needs it to
 * decide whether to play a cue.
 */

/** Two taps closer together than this are one round, not two. */
export const ROUND_DEBOUNCE_MS = 250

/**
 * Paused time owed as of `now`. A session paused right now is still
 * accruing it; one that is running has already banked all of it. `Math.max`
 * guards a clock that went backwards, which a laptop waking up does.
 */
function pausedThrough(session: WorkoutSession, now: number): number {
  return session.pauseStartedAt === undefined
    ? session.accumulatedPausedMs
    : session.accumulatedPausedMs + Math.max(0, now - session.pauseStartedAt)
}

/**
 * The pause mark removed rather than zeroed — `pauseStartedAt` is an optional
 * key, and a row carrying `undefined` for it is a different row from one
 * without it. Omitting by destructuring rather than `delete` keeps the type
 * honest; the two sites that did this each needed a cast to say the same thing.
 */
function withoutPauseMark(session: WorkoutSession): WorkoutSession {
  const { pauseStartedAt: _paused, ...rest } = session

  return rest
}

/** The countdown reached zero. */
export function startRunning(session: WorkoutSession, now: number): WorkoutSession | undefined {
  if (session.status !== 'countdown') return undefined

  return { ...session, status: 'running', updatedAt: now }
}

export function pauseAt(session: WorkoutSession, now: number): WorkoutSession | undefined {
  if (session.status !== 'running') return undefined

  return { ...session, status: 'paused', pauseStartedAt: now, updatedAt: now }
}

export function resumeAt(session: WorkoutSession, now: number): WorkoutSession | undefined {
  if (session.status !== 'paused' || session.pauseStartedAt === undefined) return undefined

  return withoutPauseMark({
    ...session,
    status: 'running',
    accumulatedPausedMs: pausedThrough(session, now),
    updatedAt: now,
  })
}

/**
 * The end, however it came. A cancelled workout is kept rather than deleted —
 * it is still a record of showing up — so the reason is stored beside the
 * status.
 *
 * Banking the paused time matters here: finishing *while paused* would
 * otherwise leave the last pause uncounted, and every elapsed time the result
 * and history screens derive from the row would be that much too long.
 *
 * The finish time is never allowed behind the open pause. A device that slept
 * hands back a `now` earlier than `pauseStartedAt` — `resumeAt` already refuses
 * to bank a negative interval for that, but storing the same `now` as
 * `finishedAt` would leave the row claiming it ended before it was paused, and
 * `elapsedSessionMs` reads `finishedAt` for a finished workout. The clock is
 * frozen at the pause anyway, so the pause mark *is* the honest finish time.
 * `startedAt` is deliberately not in the clamp: it is when the countdown ends,
 * so cancelling mid-countdown legitimately finishes before it.
 */
export function finishAt(
  session: WorkoutSession,
  reason: FinishReason,
  now: number,
): WorkoutSession | undefined {
  if (isFinishedSession(session.status)) return undefined

  const finishedAt = Math.max(now, session.pauseStartedAt ?? now)

  return withoutPauseMark({
    ...session,
    status: reason === 'cancelled' ? 'cancelled' : 'completed',
    finishReason: reason,
    finishedAt,
    accumulatedPausedMs: pausedThrough(session, finishedAt),
    updatedAt: finishedAt,
  })
}

/**
 * A tapped round split. Declined for a workout that is over, and for a second
 * tap inside the debounce window — a split the athlete did not mean to record
 * is worse than one they have to tap again for.
 */
export function appendRound(
  session: WorkoutSession,
  elapsedMs: number,
  now: number,
): WorkoutSession | undefined {
  if (session.status !== 'running' && session.status !== 'paused') return undefined

  const last = session.rounds.at(-1)
  if (last !== undefined && Math.abs(last.capturedAtElapsedMs - elapsedMs) < ROUND_DEBOUNCE_MS) {
    return undefined
  }

  return {
    ...session,
    rounds: [...session.rounds, { capturedAtElapsedMs: elapsedMs }],
    updatedAt: now,
  }
}
