import { describe, expect, it } from 'vitest'
import type { TimerMode } from '@/db'
import { DEFAULT_CONFIGS, type DerivedTimer } from '@/features/timer/domain'
import {
  countdownVoiceCue,
  callSteps,
  callStyleOf,
  currentCall,
  voiceCueFor,
  type CueSession,
} from '@/features/timer/voiceCues'

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

/** A workout of `mode` at its defaults — what the coach is told about the session. */
const session = (mode: TimerMode): CueSession => ({
  id: 'session-1',
  config: DEFAULT_CONFIGS[mode],
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

    expect(voiceCueFor(countdown, at({ round: 1 }), session('tabata'))).toBe('round-1')
  })

  it('says "Rest" when the work ends', () => {
    expect(voiceCueFor(at({}), at({ phase: 'rest', primaryMs: 10_000 }), session('tabata'))).toBe(
      'rest',
    )
  })

  it('names the next round coming out of a rest', () => {
    const rest = at({ phase: 'rest', round: 2, primaryMs: 100 })

    expect(voiceCueFor(rest, at({ round: 3 }), session('tabata'))).toBe('round-3')
  })

  it('calls the final round "Last round" rather than by its number', () => {
    const rest = at({ phase: 'rest', round: 7, primaryMs: 100 })

    expect(voiceCueFor(rest, at({ round: 8 }), session('tabata'))).toBe('last-round')
  })

  it('does not call a one-round workout its own last round', () => {
    const countdown = at({ phase: 'countdown', round: 0, totalRounds: 1 })

    expect(voiceCueFor(countdown, at({ totalRounds: 1 }), session('tabata'))).toBe('round-1')
  })

  /** EMOM never leaves `work`: the round turning over is the only boundary it has. */
  it('names an EMOM round that turns over without a phase change', () => {
    expect(voiceCueFor(at({ round: 4, primaryMs: 100 }), at({ round: 5 }), session('emom'))).toBe(
      'round-5',
    )
  })

  it('falls back to "Go" past the rounds that were recorded', () => {
    const previous = at({ round: 20, totalRounds: 30, primaryMs: 100 })

    expect(voiceCueFor(previous, at({ round: 21, totalRounds: 30 }), session('emom'))).toBe('go')
  })

  /** A circuit pass can hold several work blocks; only the first opens a round. */
  it('says "Go" for a later work block inside the same circuit pass', () => {
    const rest = at({ phase: 'rest', round: 2, primaryMs: 100 })

    expect(voiceCueFor(rest, at({ round: 2 }), session('custom'))).toBe('go')
  })

  it('says "Go" where the athlete counts the rounds, not the clock', () => {
    const countdown = at({ phase: 'countdown', round: 0, totalRounds: undefined })
    const work = at({ round: 0, totalRounds: undefined })

    expect(voiceCueFor(countdown, work, session('amrap'))).toBe('go')
    expect(voiceCueFor(countdown, at({ round: 0, totalRounds: 5 }), session('forTime'))).toBe('go')
  })

  /** A tapped split already cues itself from the write. */
  it('stays quiet when an AMRAP round is tapped', () => {
    const before = remaining(300_000, 600_000, { round: 2, totalRounds: undefined })
    const after = remaining(299_900, 600_000, { round: 3, totalRounds: undefined })

    expect(voiceCueFor(before, after, session('amrap'))).toBeUndefined()
  })
})

describe('time remaining', () => {
  it('announces the halfway point of a long phase', () => {
    expect(
      voiceCueFor(remaining(30_100, 60_000), remaining(30_000, 60_000), session('tabata')),
    ).toBe('halfway')
  })

  it('announces it once, on the tick that crosses it', () => {
    expect(
      voiceCueFor(remaining(30_000, 60_000), remaining(29_900, 60_000), session('tabata')),
    ).toBeUndefined()
    expect(
      voiceCueFor(remaining(30_300, 60_000), remaining(30_200, 60_000), session('tabata')),
    ).toBeUndefined()
  })

  /** Halfway through 20 seconds *is* ten seconds: one line, not two. */
  it('lets "Ten seconds" stand in for halfway in a classic Tabata interval', () => {
    expect(
      voiceCueFor(remaining(10_100, 20_000), remaining(10_000, 20_000), session('tabata')),
    ).toBe('ten-seconds')
  })

  it('leaves a phase under forty seconds without a halfway call', () => {
    expect(
      voiceCueFor(remaining(15_100, 30_000), remaining(15_000, 30_000), session('tabata')),
    ).toBeUndefined()
    expect(
      voiceCueFor(remaining(20_100, 40_000), remaining(20_000, 40_000), session('tabata')),
    ).toBe('halfway')
  })

  /** A 10-second rest starts at ten seconds, right as she says "Rest". */
  it('does not count down a phase shorter than twenty seconds', () => {
    expect(
      voiceCueFor(remaining(10_100, 19_000), remaining(10_000, 19_000), session('tabata')),
    ).toBeUndefined()
  })

  it('calls the last minute of a long piece, and not of a short one', () => {
    expect(
      voiceCueFor(remaining(60_100, 600_000), remaining(60_000, 600_000), session('amrap')),
    ).toBe('one-minute')
    expect(
      voiceCueFor(remaining(60_100, 180_000), remaining(60_000, 180_000), session('amrap')),
    ).toBe('one-minute')
    expect(
      voiceCueFor(remaining(60_100, 170_000), remaining(60_000, 170_000), session('amrap')),
    ).toBeUndefined()
  })

  /** In a two-minute phase the minute mark is the halfway mark. */
  it('prefers "Halfway" when both land on the same second', () => {
    expect(
      voiceCueFor(remaining(60_100, 120_000), remaining(60_000, 120_000), session('amrap')),
    ).toBe('halfway')
  })

  it('still fires when a slow tick jumps clean over the mark', () => {
    expect(voiceCueFor(remaining(10_400, 60_000), remaining(9_700, 60_000), session('emom'))).toBe(
      'ten-seconds',
    )
  })

  /** For Time counts up: the cap is the boundary, whatever the big clock shows. */
  it('counts a capped For Time towards its cap', () => {
    const before = at({ primaryMs: 149_900, remainingMs: 150_100, progress: 0.4997 })
    const after = at({ primaryMs: 150_000, remainingMs: 150_000, progress: 0.5 })

    expect(voiceCueFor(before, after, session('forTime'))).toBe('halfway')
  })

  it('has no time to call in an uncapped For Time', () => {
    const before = at({ primaryMs: 9_900, remainingMs: undefined, progress: 0 })
    const after = at({ primaryMs: 10_000, remainingMs: undefined, progress: 0 })

    expect(voiceCueFor(before, after, session('forTime'))).toBeUndefined()
    expect(voiceCueFor(after, before, session('forTime'))).toBeUndefined()
  })

  it('leaves the start countdown to the 3-2-1', () => {
    const before = remaining(10_100, 30_000, { phase: 'countdown', round: 0 })
    const after = remaining(10_000, 30_000, { phase: 'countdown', round: 0 })

    expect(voiceCueFor(before, after, session('tabata'))).toBeUndefined()
  })

  it('has nothing to measure once a phase reports itself complete', () => {
    expect(
      voiceCueFor(
        at({ primaryMs: 10_100, progress: 1 }),
        at({ primaryMs: 10_000, progress: 1 }),
        session('emom'),
      ),
    ).toBeUndefined()
  })
})

describe('a boxing round', () => {
  type Boxing = Extract<CueSession['config'], { mode: 'boxing' }>
  const boxing = (patch: Partial<Boxing> = {}, id = 'session-1'): CueSession => ({
    id,
    config: { ...DEFAULT_CONFIGS.boxing, ...patch },
  })
  /** The tick that lands `elapsedMs` into a three-minute round, a hundred ms after the last. */
  const tick = (elapsedMs: number, bout: CueSession = boxing(), round = 1) =>
    voiceCueFor(
      remaining(180_100 - elapsedMs, 180_000, { round }),
      remaining(180_000 - elapsedMs, 180_000, { round }),
      bout,
    )
  const everySlot = (bout: CueSession, round = 1) =>
    Array.from({ length: 180 }, (_, second) => tick(second * 1_000, bout, round))

  it('calls a combination on every slot of the chosen pace', () => {
    expect(tick(5_000)).toMatch(/^combo-\d\d$/)
    expect(tick(10_000)).toBeDefined()
    expect(tick(7_000)).toBeUndefined()
    expect(tick(8_000, boxing({ paceMs: 8_000 }))).toBeDefined()
    expect(tick(5_000, boxing({ paceMs: 8_000 }))).toBeUndefined()
  })

  /** She is still saying "Round one" on the bell. */
  it('leaves the bell to the round announcement', () => {
    expect(tick(0)).toBeUndefined()
  })

  /** Every punch the screen would show across six rounds of a session, call by call. */
  const callsShown = (bout: CueSession) =>
    [1, 2, 3, 4, 5, 6].flatMap((round) =>
      Array.from({ length: 180 }, (_, second) =>
        callSteps(currentCall(remaining(180_000 - second * 1_000, 180_000, { round }), bout) ?? ''),
      ),
    )

  /** Read off what the screen shows, so a new combination cannot slip into the wrong set. */
  it('keeps the basics to the jab, the cross and the hook', () => {
    const punches = (bout: CueSession) =>
      new Set(
        callsShown(bout)
          .flat()
          .map((step) => step.label),
      )
    const basics = punches(boxing({ paceMs: 3_000 }))
    const advanced = punches(boxing({ paceMs: 3_000, callouts: 'advanced' }))

    expect([...basics].toSorted()).toEqual(['Cross', 'Double jab', 'Hook', 'Jab'])
    expect(advanced).toContain('Uppercut')
    expect(advanced).toContain('Slip')
    expect(advanced).toContain('Hook to the body')
  })

  it('never asks for more than four punches', () => {
    const lengths = callsShown(boxing({ paceMs: 3_000, callouts: 'advanced' })).map(
      (steps) => steps.length,
    )

    expect(Math.max(...lengths)).toBe(4)
  })

  it('says nothing between the time calls when combinations are off', () => {
    const calls = everySlot(boxing({ callouts: 'off' })).filter((cue) => cue !== undefined)

    expect(calls).toEqual(['halfway', 'one-minute', 'thirty-seconds', 'ten-seconds'])
  })

  /** A reload mid-round has to call the sequence it was already calling. */
  it('calls the same sequence for the same round of the same workout', () => {
    expect(everySlot(boxing())).toEqual(everySlot(boxing()))
  })

  it('calls a different sequence in another round, and in another workout', () => {
    expect(everySlot(boxing(), 2)).not.toEqual(everySlot(boxing(), 1))
    expect(everySlot(boxing({}, 'session-2'))).not.toEqual(everySlot(boxing()))
  })

  /**
   * Once to hear it, once to throw it, once to throw it hard — then a new one.
   * A different call every few seconds is a memory test, not bag work.
   */
  it('calls each combination three times running, then moves on', () => {
    for (const round of [1, 2, 3, 4, 5, 6]) {
      const [first, second, third, fourth, fifth, sixth, seventh] = [5, 10, 15, 20, 25, 30, 35].map(
        (second) => tick(second * 1_000, boxing(), round),
      )

      expect([second, third]).toEqual([first, first])
      expect(fourth).not.toBe(first)
      expect([fifth, sixth]).toEqual([fourth, fourth])
      expect(seventh).not.toBe(fourth)
    }
  })

  /** A time call takes a slot from the set it lands in; the set does not start over after it. */
  it('lets a time call interrupt a set without restarting it', () => {
    const calls = everySlot(boxing())

    // Slots 16-18 are 80 s, 85 s and 90 s: "Halfway" owns the third.
    expect(calls[85]).toBe(calls[80])
    expect(calls[90]).toBe('halfway')
    expect(calls[95]).not.toBe(calls[85])
  })

  /** The time calls win their own tick, and no combination is cut off by one. */
  it('makes room for the time calls and the closing ten seconds', () => {
    for (const paceMs of [3_000, 5_000, 8_000] as const) {
      const calls = everySlot(boxing({ paceMs }))
      const marks = { 90: 'halfway', 120: 'one-minute', 150: 'thirty-seconds', 170: 'ten-seconds' }

      for (const [second, cue] of Object.entries(marks)) {
        const at = Number(second)
        expect(calls[at]).toBe(cue)
        // Three seconds for a combination to finish before, two for the call after.
        expect(calls.slice(at - 2, at)).toEqual([undefined, undefined])
        expect(calls[at + 1]).toBeUndefined()
      }
      expect(calls.slice(171).every((cue) => cue === undefined)).toBe(true)
    }
  })

  it('stays quiet through the rest', () => {
    const rest = { phase: 'rest', round: 1 } as const

    expect(
      voiceCueFor(remaining(55_100, 60_000, rest), remaining(55_000, 60_000, rest), boxing()),
    ).toBeUndefined()
  })

  it('keeps "Thirty seconds" out of a round too short for it, and out of other modes', () => {
    const short = boxing({ workMs: 60_000 })

    expect(voiceCueFor(remaining(30_100, 60_000), remaining(30_000, 60_000), short)).toBe('halfway')
    expect(
      voiceCueFor(remaining(30_100, 180_000), remaining(30_000, 180_000), session('emom')),
    ).toBeUndefined()
  })

  it('announces rounds and rests like every structural mode', () => {
    const rest = remaining(100, 60_000, { phase: 'rest', round: 5, totalRounds: 6 })

    expect(voiceCueFor(rest, at({ round: 6, totalRounds: 6 }), boxing())).toBe('last-round')
    expect(voiceCueFor(at({}), at({ phase: 'rest' }), boxing())).toBe('rest')
  })
})

describe('a themed boxing session', () => {
  type Boxing = Extract<CueSession['config'], { mode: 'boxing' }>
  const classic = (patch: Partial<Boxing> = {}): CueSession => ({
    id: 'session-1',
    config: {
      ...DEFAULT_CONFIGS.boxing,
      themes: ['warmup', 'power', 'power', 'speed', 'speed', 'endurance'],
      ...patch,
    },
  })
  /** Every second of one three-minute round, as the cue each tick produced. */
  const roundOf = (round: number, bout: CueSession = classic()) =>
    Array.from({ length: 180 }, (_, second) =>
      voiceCueFor(
        // A one-second tick, so a line due mid-second lands on the next one.
        remaining(Math.min(180_100, 181_000 - second * 1_000), 180_000, { round }),
        remaining(180_000 - second * 1_000, 180_000, { round }),
        bout,
      ),
    )
  const spoken = (cues: ReadonlyArray<string | undefined>) =>
    cues.flatMap((cue, second) => (cue === undefined ? [] : [`${second}s ${cue}`]))
  const TIME_CALLS = ['halfway', 'one-minute', 'thirty-seconds', 'ten-seconds']
  const callsOf = (round: number, bout?: CueSession) =>
    roundOf(round, bout).filter((cue) => cue !== undefined && !TIME_CALLS.includes(cue))

  /** A beat after the bell: "Round four" has to finish first. */
  it('opens each round with what it is for', () => {
    const tick = (round: number, elapsedMs: number) =>
      voiceCueFor(
        remaining(180_100 - elapsedMs, 180_000, { round }),
        remaining(180_000 - elapsedMs, 180_000, { round }),
        classic(),
      )

    expect(tick(1, 1_500)).toBe('theme-warmup')
    expect(tick(2, 1_500)).toBe('theme-power')
    expect(tick(4, 1_500)).toBe('theme-speed')
    expect(tick(6, 1_500)).toBe('theme-endurance')
    expect(tick(4, 1_400)).toBeUndefined()
    expect(tick(4, 1_600)).toBeUndefined()
  })

  /**
   * A themed round is explained at the bell and then left alone: the athlete
   * knows the job, and hears only the time until the next bell.
   */
  it('explains a themed round once, then calls nothing but the time', () => {
    const openings = { 1: 'theme-warmup', 2: 'theme-power', 6: 'theme-endurance' }

    for (const [round, opening] of Object.entries(openings)) {
      expect(spoken(roundOf(Number(round))).map((line) => line.split(' ')[1])).toEqual([
        opening,
        'halfway',
        'one-minute',
        'thirty-seconds',
        'ten-seconds',
      ])
    }
  })

  /**
   * The opening line says "fast hands", so the first call is the breather —
   * and no sprint is lost to "Halfway" or "One minute left".
   */
  it('alternates sprint and breather through a speed round', () => {
    expect(
      spoken(roundOf(4)).filter((line) => !TIME_CALLS.some((call) => line.endsWith(call))),
    ).toEqual([
      '2s theme-speed',
      '22s easy-breathe',
      '37s fast-hands',
      '52s easy-breathe',
      '67s fast-hands',
      '82s easy-breathe',
      '97s fast-hands',
      '112s easy-breathe',
      '127s fast-hands',
      '142s easy-breathe',
      '157s fast-hands',
    ])
  })

  /** The explanation is a whole sentence; the first sprint call waits for it to end. */
  it('lets the opening line finish before the first call', () => {
    const quick = classic({ themes: ['speed'], workMs: 60_000 })
    const calls = Array.from({ length: 30 }, (_, second) =>
      voiceCueFor(
        remaining(Math.min(60_100, 61_000 - second * 1_000), 60_000),
        remaining(60_000 - second * 1_000, 60_000),
        quick,
      ),
    )

    expect(spoken(calls)).toEqual(['2s theme-speed', '22s easy-breathe'])
  })

  /** The one unthemed round of a program is still the round of called combinations. */
  it('keeps calling combinations in a round themed "combos"', () => {
    const beginner = classic({ themes: ['warmup', 'combos', 'endurance'] })
    const calls = callsOf(2, beginner)

    expect(calls.length).toBeGreaterThan(20)
    expect(calls.every((cue) => /^combo-\d\d$/.test(cue ?? ''))).toBe(true)
  })

  it('repeats the themes when the rounds outnumber them', () => {
    expect(spoken(roundOf(7))[0]).toBe('2s theme-warmup')
  })

  /** "Off" quiets the round, not the plan: the athlete still hears what each round is. */
  it('still announces the themes with the calls switched off', () => {
    expect(callsOf(4, classic({ callouts: 'off' }))).toEqual(['theme-speed'])
  })

  /** In the rest, after "Rest" itself — the one moment she can say what is coming. */
  it('says what the next round is, three seconds into the rest', () => {
    const rest = (round: number, elapsedMs: number, bout: CueSession = classic()) =>
      voiceCueFor(
        remaining(60_100 - elapsedMs, 60_000, { phase: 'rest', round }),
        remaining(60_000 - elapsedMs, 60_000, { phase: 'rest', round }),
        bout,
      )

    expect(rest(1, 3_000)).toBe('next-power')
    expect(rest(3, 3_000)).toBe('next-speed')
    expect(rest(5, 3_000)).toBe('next-endurance')
    expect(rest(1, 3_000, classic({ themes: ['warmup', 'combos'] }))).toBe('next-combos')
    expect(rest(2, 3_000, classic({ themes: ['warmup', 'combos'] }))).toBe('next-warmup')
    expect(rest(1, 2_900)).toBeUndefined()
    expect(rest(1, 30_000)).toBe('halfway')
  })

  it('skips the preview in a rest too short to use it, and in a freestyle session', () => {
    const short = classic({ restMs: 10_000 })
    const tick = (bout: CueSession, restMs: number) =>
      voiceCueFor(
        remaining(restMs - 2_900, restMs, { phase: 'rest', round: 1 }),
        remaining(restMs - 3_000, restMs, { phase: 'rest', round: 1 }),
        bout,
      )

    expect(tick(short, 10_000)).toBeUndefined()
    expect(tick(classic({ restMs: 15_000 }), 15_000)).toBe('next-power')
    expect(tick(classic({ themes: [] }), 60_000)).toBeUndefined()
  })
})

describe('the call on screen', () => {
  type Boxing = Extract<CueSession['config'], { mode: 'boxing' }>
  const boxing = (patch: Partial<Boxing> = {}): CueSession => ({
    id: 'session-1',
    config: { ...DEFAULT_CONFIGS.boxing, ...patch },
  })
  const at3min = (elapsedMs: number, patch: Partial<DerivedTimer> = {}) =>
    remaining(180_000 - elapsedMs, 180_000, patch)
  const shown = (cue: Parameters<typeof callSteps>[0]) =>
    callSteps(cue)
      .map((step) => (step.side === undefined ? step.label : `${step.label} ${step.side}`))
      .join(' · ')

  /** One source for the ear and the eye: the call shown is the clip that was just played. */
  it('shows the call the voice just made, until the next one', () => {
    const spoken = voiceCueFor(at3min(4_900), at3min(5_000), boxing())

    expect(spoken).toMatch(/^combo-\d\d$/)
    expect(currentCall(at3min(5_000), boxing())).toBe(spoken)
    // Three calls of it, five seconds apart — and it stays up between them.
    expect(currentCall(at3min(19_900), boxing())).toBe(spoken)
    expect(currentCall(at3min(20_000), boxing())).not.toBe(spoken)
  })

  /** A reload mid-round has no "previous" reading, and still shows the call. */
  it('needs only the current reading', () => {
    expect(currentCall(at3min(7_300), boxing())).toBe(currentCall(at3min(5_000), boxing()))
  })

  it('follows the theme of the round', () => {
    const speed = boxing({ themes: ['speed'] })

    expect(currentCall(at3min(25_000), speed)).toBe('easy-breathe')
    expect(currentCall(at3min(40_000), speed)).toBe('fast-hands')
    // A round that is explained once has no call to show.
    expect(currentCall(at3min(20_000), boxing({ themes: ['endurance'] }))).toBe('')
    expect(currentCall(at3min(20_000), boxing({ themes: ['power'] }))).toBe('')
  })

  /** Empty keeps the line's space on screen; the clock must not jump between calls. */
  it('is empty, not absent, while a boxing round has nothing called', () => {
    expect(currentCall(at3min(2_000), boxing())).toBe('')
    expect(currentCall(at3min(90_000), boxing())).toBe('')
    expect(currentCall(at3min(175_000), boxing())).toBe('')
    expect(currentCall(at3min(60_000), boxing({ callouts: 'off' }))).toBe('')
  })

  it('is absent outside a boxing round', () => {
    expect(currentCall(at3min(5_000, { phase: 'rest' }), boxing())).toBeUndefined()
    expect(currentCall(at3min(5_000, { phase: 'countdown' }), boxing())).toBeUndefined()
    expect(currentCall(at3min(5_000), session('tabata'))).toBeUndefined()
    expect(currentCall(at({ remainingMs: undefined }), boxing())).toBeUndefined()
  })

  /** The voice leaves left and right to the athlete; the screen does not. */
  it('names the hand for every punch: jab and hook lead, cross rear', () => {
    expect(shown('combo-07')).toBe('Cross R · Hook L · Cross R')
    expect(shown('combo-05')).toBe('Jab L · Cross R · Hook L')
    expect(shown('combo-04')).toBe('Double jab L · Cross R')
    expect(shown('combo-08')).toBe('Jab L · Hook L')
  })

  /** An uppercut is whichever hand the punch before it did not use. */
  it('alternates into an uppercut', () => {
    expect(shown('combo-13')).toBe('Jab L · Cross R · Uppercut L')
    expect(shown('combo-14')).toBe('Jab L · Uppercut R · Hook L')
    expect(shown('combo-23')).toBe('Jab L · Cross R · Hook L · Uppercut R')
  })

  it('gives a slip, a roll or a word from the corner no hand', () => {
    expect(shown('combo-16')).toBe('Jab L · Cross R · Slip · Cross R')
    expect(shown('combo-24')).toBe('Roll · Hook L · Cross R')
    expect(shown('fast-hands')).toBe('Fast hands')
    expect(shown('easy-breathe')).toBe('Easy · Breathe')
  })

  /** The gym's numbers, for a right-hander: 1 jab, 2 cross, 3 hook, 5 and 6 the uppercuts. */
  it('writes a call in punch numbers when the voice is using them', () => {
    const numbered = (cue: Parameters<typeof callSteps>[0]) =>
      callSteps(cue, 'numbers')
        .map((step) => (step.side === undefined ? step.label : `${step.label} ${step.side}`))
        .join(' · ')

    expect(numbered('combo-04')).toBe('1 · 1 L · 2 R')
    expect(numbered('combo-09')).toBe('1 L · 2 R · 3 L · 2 R')
    expect(numbered('combo-25')).toBe('1 L · 6 R · 3 L · 2 R')
    expect(numbered('combo-26')).toBe('1 L · 2 R · 5 L · 2 R')
    expect(numbered('combo-18')).toBe('2 R · 3 body L')
    // A slip has no number, and neither does a sprint call.
    expect(numbered('combo-16')).toBe('1 L · 2 R · Slip · 2 R')
    expect(numbered('fast-hands')).toBe('Fast hands')
  })

  /** One combination, one clip per style: the number clip carries the same index. */
  it('plays the number clip for the combination it would have named', () => {
    const named = voiceCueFor(at3min(4_900), at3min(5_000), boxing())
    const numbered = voiceCueFor(at3min(4_900), at3min(5_000), boxing({ callsAs: 'numbers' }))

    expect(named).toMatch(/^combo-\d\d$/)
    expect(numbered).toBe(named?.replace('combo-', 'num-'))
    // The screen keeps its own key either way; only the words on it change.
    expect(currentCall(at3min(5_000), boxing({ callsAs: 'numbers' }))).toBe(named)
    expect(callStyleOf(boxing({ callsAs: 'numbers' }))).toBe('numbers')
    expect(callStyleOf(boxing())).toBe('names')
    expect(callStyleOf(session('tabata'))).toBe('names')
  })

  it('leaves the sprint calls of a speed round as they are', () => {
    const speed = boxing({ themes: ['speed'], callsAs: 'numbers' })

    expect(voiceCueFor(at3min(21_900), at3min(22_000), speed)).toBe('easy-breathe')
  })

  it('draws nothing for no call', () => {
    expect(callSteps('')).toEqual([])
  })
})

describe('the first thing she sees', () => {
  it('says "Get ready" when the start countdown leaves room for it', () => {
    expect(
      voiceCueFor(undefined, at({ phase: 'countdown', remainingMs: 10_000 }), session('tabata')),
    ).toBe('get-ready')
  })

  /** Three seconds of countdown is "Three" already. */
  it('does not talk over a short countdown', () => {
    expect(
      voiceCueFor(undefined, at({ phase: 'countdown', remainingMs: 4_000 }), session('tabata')),
    ).toBeUndefined()
  })

  /** A reload mid-workout: nothing just happened, so nothing is announced. */
  it('announces nothing when it joins a workout already under way', () => {
    expect(voiceCueFor(undefined, at({ round: 3 }), session('tabata'))).toBeUndefined()
  })

  it('announces nothing for a finished workout', () => {
    expect(
      voiceCueFor(at({}), at({ phase: 'finished', isComplete: true }), session('tabata')),
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
