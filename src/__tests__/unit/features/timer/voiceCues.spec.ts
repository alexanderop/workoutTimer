import { describe, expect, it } from 'vitest'
import type { DerivedTimer } from '@/features/timer/domain'
import { countdownVoiceCue, voiceCueFor } from '@/features/timer/voiceCues'

/**
 * What the coach says, and — as much of the point — when she stays quiet.
 * Every line is a transition between two derived states, so each case below
 * is a `previous` and a `state` and the one clip they should produce.
 */
const at = (patch: Partial<DerivedTimer>): DerivedTimer => ({
  elapsedMs: 0,
  primaryMs: 20_000,
  remainingMs: 20_000,
  phase: 'work',
  round: 1,
  completedRounds: 0,
  totalRounds: 8,
  progress: 0,
  isComplete: false,
  ...patch,
})

/** A state `remainingMs` from the end of a phase `durationMs` long. */
const remaining = (
  remainingMs: number,
  durationMs: number,
  patch: Partial<DerivedTimer> = {},
): DerivedTimer =>
  at({ primaryMs: remainingMs, remainingMs, progress: 1 - remainingMs / durationMs, ...patch })

describe('phase announcements', () => {
  it('names the round when work begins after the start countdown', () => {
    const countdown = at({ phase: 'countdown', round: 0, primaryMs: 100 })

    expect(voiceCueFor(countdown, at({ round: 1 }), 'tabata')).toBe('round-1')
  })

  it('says "Rest" when the work ends', () => {
    expect(voiceCueFor(at({}), at({ phase: 'rest', primaryMs: 10_000 }), 'tabata')).toBe('rest')
  })

  it('names the next round coming out of a rest', () => {
    const rest = at({ phase: 'rest', round: 2, primaryMs: 100 })

    expect(voiceCueFor(rest, at({ round: 3 }), 'tabata')).toBe('round-3')
  })

  it('calls the final round "Last round" rather than by its number', () => {
    const rest = at({ phase: 'rest', round: 7, primaryMs: 100 })

    expect(voiceCueFor(rest, at({ round: 8 }), 'tabata')).toBe('last-round')
  })

  it('does not call a one-round workout its own last round', () => {
    const countdown = at({ phase: 'countdown', round: 0, totalRounds: 1 })

    expect(voiceCueFor(countdown, at({ totalRounds: 1 }), 'tabata')).toBe('round-1')
  })

  /** EMOM never leaves `work`: the round turning over is the only boundary it has. */
  it('names an EMOM round that turns over without a phase change', () => {
    expect(voiceCueFor(at({ round: 4, primaryMs: 100 }), at({ round: 5 }), 'emom')).toBe('round-5')
  })

  it('falls back to "Go" past the rounds that were recorded', () => {
    const previous = at({ round: 20, totalRounds: 30, primaryMs: 100 })

    expect(voiceCueFor(previous, at({ round: 21, totalRounds: 30 }), 'emom')).toBe('go')
  })

  /** A circuit pass can hold several work blocks; only the first opens a round. */
  it('says "Go" for a later work block inside the same circuit pass', () => {
    const rest = at({ phase: 'rest', round: 2, primaryMs: 100 })

    expect(voiceCueFor(rest, at({ round: 2 }), 'custom')).toBe('go')
  })

  it('says "Go" where the athlete counts the rounds, not the clock', () => {
    const countdown = at({ phase: 'countdown', round: 0, totalRounds: undefined })
    const work = at({ round: 0, totalRounds: undefined })

    expect(voiceCueFor(countdown, work, 'amrap')).toBe('go')
    expect(voiceCueFor(countdown, at({ round: 0, totalRounds: 5 }), 'forTime')).toBe('go')
  })

  /** A tapped split already cues itself from the write. */
  it('stays quiet when an AMRAP round is tapped', () => {
    const before = remaining(300_000, 600_000, { round: 2, totalRounds: undefined })
    const after = remaining(299_900, 600_000, { round: 3, totalRounds: undefined })

    expect(voiceCueFor(before, after, 'amrap')).toBeUndefined()
  })
})

describe('time remaining', () => {
  it('announces the halfway point of a long phase', () => {
    expect(voiceCueFor(remaining(30_100, 60_000), remaining(30_000, 60_000), 'tabata')).toBe(
      'halfway',
    )
  })

  it('announces it once, on the tick that crosses it', () => {
    expect(
      voiceCueFor(remaining(30_000, 60_000), remaining(29_900, 60_000), 'tabata'),
    ).toBeUndefined()
    expect(
      voiceCueFor(remaining(30_300, 60_000), remaining(30_200, 60_000), 'tabata'),
    ).toBeUndefined()
  })

  /** Halfway through 20 seconds *is* ten seconds: one line, not two. */
  it('lets "Ten seconds" stand in for halfway in a classic Tabata interval', () => {
    expect(voiceCueFor(remaining(10_100, 20_000), remaining(10_000, 20_000), 'tabata')).toBe(
      'ten-seconds',
    )
  })

  it('leaves a phase under forty seconds without a halfway call', () => {
    expect(
      voiceCueFor(remaining(15_100, 30_000), remaining(15_000, 30_000), 'tabata'),
    ).toBeUndefined()
    expect(voiceCueFor(remaining(20_100, 40_000), remaining(20_000, 40_000), 'tabata')).toBe(
      'halfway',
    )
  })

  /** A 10-second rest starts at ten seconds, right as she says "Rest". */
  it('does not count down a phase shorter than twenty seconds', () => {
    expect(
      voiceCueFor(remaining(10_100, 19_000), remaining(10_000, 19_000), 'tabata'),
    ).toBeUndefined()
  })

  it('calls the last minute of a long piece, and not of a short one', () => {
    expect(voiceCueFor(remaining(60_100, 600_000), remaining(60_000, 600_000), 'amrap')).toBe(
      'one-minute',
    )
    expect(voiceCueFor(remaining(60_100, 180_000), remaining(60_000, 180_000), 'amrap')).toBe(
      'one-minute',
    )
    expect(
      voiceCueFor(remaining(60_100, 170_000), remaining(60_000, 170_000), 'amrap'),
    ).toBeUndefined()
  })

  /** In a two-minute phase the minute mark is the halfway mark. */
  it('prefers "Halfway" when both land on the same second', () => {
    expect(voiceCueFor(remaining(60_100, 120_000), remaining(60_000, 120_000), 'amrap')).toBe(
      'halfway',
    )
  })

  it('still fires when a slow tick jumps clean over the mark', () => {
    expect(voiceCueFor(remaining(10_400, 60_000), remaining(9_700, 60_000), 'emom')).toBe(
      'ten-seconds',
    )
  })

  /** For Time counts up: the cap is the boundary, whatever the big clock shows. */
  it('counts a capped For Time towards its cap', () => {
    const before = at({ primaryMs: 149_900, remainingMs: 150_100, progress: 0.4997 })
    const after = at({ primaryMs: 150_000, remainingMs: 150_000, progress: 0.5 })

    expect(voiceCueFor(before, after, 'forTime')).toBe('halfway')
  })

  it('has no time to call in an uncapped For Time', () => {
    const before = at({ primaryMs: 9_900, remainingMs: undefined, progress: 0 })
    const after = at({ primaryMs: 10_000, remainingMs: undefined, progress: 0 })

    expect(voiceCueFor(before, after, 'forTime')).toBeUndefined()
    expect(voiceCueFor(after, before, 'forTime')).toBeUndefined()
  })

  it('leaves the start countdown to the 3-2-1', () => {
    const before = remaining(10_100, 30_000, { phase: 'countdown', round: 0 })
    const after = remaining(10_000, 30_000, { phase: 'countdown', round: 0 })

    expect(voiceCueFor(before, after, 'tabata')).toBeUndefined()
  })

  it('has nothing to measure once a phase reports itself complete', () => {
    expect(
      voiceCueFor(
        at({ primaryMs: 10_100, progress: 1 }),
        at({ primaryMs: 10_000, progress: 1 }),
        'emom',
      ),
    ).toBeUndefined()
  })
})

describe('the first thing she sees', () => {
  it('says "Get ready" when the start countdown leaves room for it', () => {
    expect(voiceCueFor(undefined, at({ phase: 'countdown', remainingMs: 10_000 }), 'tabata')).toBe(
      'get-ready',
    )
  })

  /** Three seconds of countdown is "Three" already. */
  it('does not talk over a short countdown', () => {
    expect(
      voiceCueFor(undefined, at({ phase: 'countdown', remainingMs: 4_000 }), 'tabata'),
    ).toBeUndefined()
  })

  /** A reload mid-workout: nothing just happened, so nothing is announced. */
  it('announces nothing when it joins a workout already under way', () => {
    expect(voiceCueFor(undefined, at({ round: 3 }), 'tabata')).toBeUndefined()
  })

  it('announces nothing for a finished workout', () => {
    expect(
      voiceCueFor(at({}), at({ phase: 'finished', isComplete: true }), 'tabata'),
    ).toBeUndefined()
  })
})

describe('the 3-2-1', () => {
  it('maps each of the last three seconds to its clip', () => {
    expect([3, 2, 1].map(countdownVoiceCue)).toEqual(['three', 'two', 'one'])
  })

  it('has no clip for any other second', () => {
    expect(countdownVoiceCue(4)).toBeUndefined()
    expect(countdownVoiceCue(0)).toBeUndefined()
  })
})
