import { describe, expect, it } from 'vitest'
import { SESSION_STATUSES } from '@/db/converters'
import {
  appendRound,
  finishAt,
  pauseAt,
  resumeAt,
  ROUND_DEBOUNCE_MS,
  startRunning,
} from '@/db/sessionTransitions'
import type { SessionStatus, WorkoutSession } from '@/db'

function session(patch: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    config: { mode: 'amrap', durationMs: 600_000 },
    status: 'running',
    workoutNotes: '',
    notes: '',
    countdownDurationMs: 3_000,
    startedAt: 1_000,
    accumulatedPausedMs: 0,
    rounds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...patch,
  }
}

/** Every status except the ones a transition is supposed to accept. */
const allBut = (...accepted: Array<SessionStatus>): Array<SessionStatus> =>
  SESSION_STATUSES.filter((status) => !accepted.includes(status))

describe('startRunning', () => {
  it('takes a session off the countdown', () => {
    expect(startRunning(session({ status: 'countdown' }), 5_000)).toEqual(
      session({ status: 'running', updatedAt: 5_000 }),
    )
  })

  it('declines any status that is not counting down', () => {
    for (const status of allBut('countdown')) {
      expect(startRunning(session({ status }), 5_000)).toBeUndefined()
    }
  })
})

describe('pauseAt', () => {
  it('marks when the pause began', () => {
    expect(pauseAt(session({ status: 'running' }), 5_000)).toEqual(
      session({ status: 'paused', pauseStartedAt: 5_000, updatedAt: 5_000 }),
    )
  })

  /**
   * Pausing a countdown is the one that looks like it should work. It must
   * not: the countdown's end is `startedAt`, an absolute time, so a pause
   * there would have to move the start rather than bank an interval.
   */
  it('declines any status that is not running', () => {
    for (const status of allBut('running')) {
      expect(pauseAt(session({ status }), 5_000)).toBeUndefined()
    }
  })
})

describe('resumeAt', () => {
  it('banks the pause and clears the mark', () => {
    const paused = session({ status: 'paused', pauseStartedAt: 5_000, accumulatedPausedMs: 2_000 })
    const resumed = resumeAt(paused, 9_000)

    expect(resumed).toEqual(
      session({ status: 'running', accumulatedPausedMs: 6_000, updatedAt: 9_000 }),
    )
    // Removed, not set to undefined: the row must not carry the key at all,
    // or the next pause reads a stale mark.
    expect(resumed !== undefined && 'pauseStartedAt' in resumed).toBe(false)
  })

  it('declines any status that is not paused', () => {
    for (const status of allBut('paused')) {
      expect(resumeAt(session({ status, pauseStartedAt: 5_000 }), 9_000)).toBeUndefined()
    }
  })

  /** A paused row with no mark is corrupt; resuming it would bank nonsense. */
  it('declines a paused session with no pause mark', () => {
    expect(resumeAt(session({ status: 'paused' }), 9_000)).toBeUndefined()
  })

  /**
   * A device that slept can hand back a `now` behind the mark. Banking a
   * negative interval would shorten the accumulated pause and make the
   * workout look longer than it was.
   */
  it('banks nothing when the clock went backwards', () => {
    const paused = session({ status: 'paused', pauseStartedAt: 9_000, accumulatedPausedMs: 2_000 })

    expect(resumeAt(paused, 5_000)?.accumulatedPausedMs).toBe(2_000)
  })
})

describe('finishAt', () => {
  it('completes a running workout', () => {
    expect(finishAt(session({ status: 'running' }), 'endpoint', 9_000)).toEqual(
      session({
        status: 'completed',
        finishReason: 'endpoint',
        finishedAt: 9_000,
        updatedAt: 9_000,
      }),
    )
  })

  /** Cancelling keeps the row — showing up is still a record — with its reason. */
  it('cancels rather than deletes', () => {
    const cancelled = finishAt(session({ status: 'running' }), 'cancelled', 9_000)

    expect(cancelled?.status).toBe('cancelled')
    expect(cancelled?.finishReason).toBe('cancelled')
  })

  it.each(['endpoint', 'manual', 'timeCap'] as const)('completes for reason %s', (reason) => {
    expect(finishAt(session({ status: 'running' }), reason, 9_000)?.status).toBe('completed')
  })

  /**
   * Finishing *while paused* has to bank the open pause. Miss it and every
   * elapsed time derived from the row afterwards — the result screen, the
   * history row — is that much too long.
   */
  it('banks an open pause before closing the workout', () => {
    const paused = session({ status: 'paused', pauseStartedAt: 5_000, accumulatedPausedMs: 1_000 })
    const finished = finishAt(paused, 'manual', 9_000)

    expect(finished?.accumulatedPausedMs).toBe(5_000)
    expect(finished !== undefined && 'pauseStartedAt' in finished).toBe(false)
  })

  /**
   * The counterpart to resumeAt's backwards-clock guard. A `now` behind the
   * open pause must not become a `finishedAt` behind it too: the workout's
   * clock stopped at the pause, so that is the finish time, and storing the
   * earlier `now` would make `elapsedSessionMs` report a shorter workout than
   * the athlete did.
   */
  it('does not finish a paused workout before the pause began', () => {
    const paused = session({ status: 'paused', pauseStartedAt: 9_000, accumulatedPausedMs: 1_000 })
    const finished = finishAt(paused, 'manual', 5_000)

    expect(finished?.finishedAt).toBe(9_000)
    expect(finished?.updatedAt).toBe(9_000)
    expect(finished?.accumulatedPausedMs).toBe(1_000)
  })

  /**
   * Cancelling during the countdown finishes before `startedAt` — that field
   * is when the countdown *ends* — so the clamp must not drag the finish
   * forward to it.
   */
  it('finishes a countdown at the moment it was cancelled', () => {
    const counting = session({ status: 'countdown', startedAt: 9_000 })

    expect(finishAt(counting, 'cancelled', 7_000)?.finishedAt).toBe(7_000)
  })

  /** The automatic endpoint finish can race the athlete's manual one. */
  it('declines a workout that is already over', () => {
    for (const status of ['completed', 'cancelled'] as const) {
      expect(finishAt(session({ status }), 'manual', 9_000)).toBeUndefined()
    }
  })

  it('finishes a workout still on the countdown', () => {
    expect(finishAt(session({ status: 'countdown' }), 'cancelled', 9_000)?.status).toBe('cancelled')
  })
})

describe('appendRound', () => {
  it('adds a split at the elapsed time it was tapped', () => {
    expect(appendRound(session(), 30_000, 9_000)?.rounds).toEqual([{ capturedAtElapsedMs: 30_000 }])
  })

  it('keeps the splits already recorded', () => {
    const withOne = session({ rounds: [{ capturedAtElapsedMs: 10_000 }] })

    expect(appendRound(withOne, 30_000, 9_000)?.rounds).toEqual([
      { capturedAtElapsedMs: 10_000 },
      { capturedAtElapsedMs: 30_000 },
    ])
  })

  it('records a split against a paused workout', () => {
    expect(appendRound(session({ status: 'paused' }), 30_000, 9_000)?.rounds).toHaveLength(1)
  })

  it('declines a workout that is not under way', () => {
    for (const status of allBut('running', 'paused')) {
      expect(appendRound(session({ status }), 30_000, 9_000)).toBeUndefined()
    }
  })

  /**
   * A double-tap is one round. The window is compared on the *elapsed* time
   * the taps report, not on wall clock, because that is what a split is.
   */
  it('treats a second tap inside the debounce window as the same round', () => {
    const withOne = session({ rounds: [{ capturedAtElapsedMs: 30_000 }] })

    expect(appendRound(withOne, 30_000 + ROUND_DEBOUNCE_MS - 1, 9_000)).toBeUndefined()
    expect(appendRound(withOne, 30_000 - ROUND_DEBOUNCE_MS + 1, 9_000)).toBeUndefined()
    expect(appendRound(withOne, 30_000 + ROUND_DEBOUNCE_MS, 9_000)?.rounds).toHaveLength(2)
    expect(appendRound(withOne, 30_000 - ROUND_DEBOUNCE_MS, 9_000)?.rounds).toHaveLength(2)
  })

  /** Only the most recent split guards the window — an earlier one is history. */
  it('compares against the last split, not any of them', () => {
    const withTwo = session({
      rounds: [{ capturedAtElapsedMs: 30_000 }, { capturedAtElapsedMs: 60_000 }],
    })

    expect(appendRound(withTwo, 30_010, 9_000)?.rounds).toHaveLength(3)
  })
})

describe('every transition', () => {
  /** A transition that declines must not have touched the row on the way out. */
  it('leaves the session it was given alone', () => {
    const original = session({ status: 'paused', pauseStartedAt: 5_000 })
    const snapshot = structuredClone(original)

    startRunning(original, 9_000)
    pauseAt(original, 9_000)
    resumeAt(original, 9_000)
    finishAt(original, 'manual', 9_000)
    appendRound(original, 30_000, 9_000)

    expect(original).toEqual(snapshot)
  })

  it('stamps updatedAt on everything it does write', () => {
    expect(startRunning(session({ status: 'countdown' }), 9_000)?.updatedAt).toBe(9_000)
    expect(pauseAt(session({ status: 'running' }), 9_000)?.updatedAt).toBe(9_000)
    expect(resumeAt(session({ status: 'paused', pauseStartedAt: 5_000 }), 9_000)?.updatedAt).toBe(
      9_000,
    )
    expect(finishAt(session(), 'manual', 9_000)?.updatedAt).toBe(9_000)
    expect(appendRound(session(), 30_000, 9_000)?.updatedAt).toBe(9_000)
  })
})
