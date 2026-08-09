import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { FastCheck } from 'effect/testing'
import {
  capturesRoundSplits,
  DEFAULT_CONFIGS,
  deriveTimer,
  elapsedSessionMs,
  finalResult,
  formatDuration,
  isActiveSession,
  isFinishedSession,
  isTimerConfig,
  MINUTE_MS,
  parseTimerMode,
  sortPresets,
  sortSessions,
  TIMER_MODES,
  totalDurationMs,
} from '@/features/timer/domain'
import {
  SESSION_STATUSES,
  TimerConfigSchema,
  TimerPresetSchema,
  WorkoutSessionSchema,
} from '@/db/converters'
import type { TimerConfig, TimerPreset, WorkoutSession } from '@/db'

function session(config: TimerConfig, patch: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    config,
    status: 'running',
    workoutNotes: '',
    notes: '',
    countdownDurationMs: 0,
    startedAt: 1_000,
    accumulatedPausedMs: 0,
    rounds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...patch,
  }
}

describe('timer domain', () => {
  it('provides valid defaults for every supported mode', () => {
    expect(MINUTE_MS).toBe(60_000)
    expect(DEFAULT_CONFIGS).toEqual({
      amrap: { mode: 'amrap', durationMs: 600_000 },
      forTime: { mode: 'forTime' },
      emom: { mode: 'emom', intervalMs: 60_000, rounds: 10 },
      tabata: { mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 8 },
    })
    expect(Object.values(DEFAULT_CONFIGS).every(isTimerConfig)).toBe(true)
  })

  it('validates timer bounds and integer requirements', () => {
    expect(isTimerConfig({ mode: 'amrap', durationMs: 1_000 })).toBe(true)
    expect(isTimerConfig({ mode: 'amrap', durationMs: 86_400_000 })).toBe(true)
    expect(isTimerConfig({ mode: 'amrap', durationMs: 999 })).toBe(false)
    expect(isTimerConfig({ mode: 'amrap', durationMs: 86_400_001 })).toBe(false)
    expect(isTimerConfig({ mode: 'forTime' })).toBe(true)
    expect(isTimerConfig({ mode: 'forTime', timeCapMs: 5_000, targetRounds: 2 })).toBe(true)
    expect(isTimerConfig({ mode: 'forTime', timeCapMs: 1_500.5 })).toBe(false)
    expect(isTimerConfig({ mode: 'forTime', targetRounds: 0 })).toBe(false)
    expect(isTimerConfig({ mode: 'emom', intervalMs: 60_000, rounds: 999 })).toBe(true)
    expect(isTimerConfig({ mode: 'emom', intervalMs: 0, rounds: 1 })).toBe(false)
    expect(isTimerConfig({ mode: 'emom', intervalMs: 1_000, rounds: 1_000 })).toBe(false)
    expect(isTimerConfig({ mode: 'tabata', workMs: 1_000, restMs: 0, rounds: 1 })).toBe(true)
    expect(isTimerConfig({ mode: 'tabata', workMs: 1_000, restMs: -1, rounds: 1 })).toBe(false)
    expect(isTimerConfig({ mode: 'tabata', workMs: 1_000, restMs: 0.5, rounds: 1 })).toBe(false)
    expect(isTimerConfig({ mode: 'tabata', workMs: 1_000, restMs: 86_400_000, rounds: 1 })).toBe(
      true,
    )
    expect(isTimerConfig({ mode: 'tabata', workMs: 1_000, restMs: 86_400_001, rounds: 1 })).toBe(
      false,
    )
  })

  it('calculates the endpoint for every mode', () => {
    expect(totalDurationMs({ mode: 'amrap', durationMs: 10_000 })).toBe(10_000)
    expect(totalDurationMs({ mode: 'forTime' })).toBeUndefined()
    expect(totalDurationMs({ mode: 'forTime', timeCapMs: 90_000 })).toBe(90_000)
    expect(totalDurationMs({ mode: 'emom', intervalMs: 30_000, rounds: 4 })).toBe(120_000)
    expect(totalDurationMs({ mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 1 })).toBe(
      20_000,
    )
    expect(totalDurationMs({ mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 3 })).toBe(
      80_000,
    )
  })

  it('derives the pre-start countdown without consuming workout time', () => {
    expect(
      deriveTimer(
        session(
          { mode: 'amrap', durationMs: 60_000 },
          { status: 'countdown', startedAt: 4_000, countdownDurationMs: 3_000 },
        ),
        2_500,
      ),
    ).toEqual({
      elapsedMs: 0,
      primaryMs: 1_500,
      phase: 'countdown',
      round: 0,
      completedRounds: 0,
      progress: 0.5,
      isComplete: false,
    })
    expect(
      deriveTimer(
        session(
          { mode: 'amrap', durationMs: 60_000 },
          { status: 'countdown', startedAt: 4_000, countdownDurationMs: 3_000 },
        ),
        4_000,
      ).phase,
    ).toBe('work')
    expect(
      deriveTimer(
        session({ mode: 'amrap', durationMs: 60_000 }, { status: 'running', startedAt: 4_000 }),
        2_500,
      ).phase,
    ).toBe('work')
  })

  it('derives AMRAP remaining time from timestamps', () => {
    const state = deriveTimer(
      session({ mode: 'amrap', durationMs: 60_000 }, { rounds: [{ capturedAtElapsedMs: 10_000 }] }),
      16_000,
    )
    expect(state).toEqual({
      elapsedMs: 15_000,
      primaryMs: 45_000,
      phase: 'work',
      round: 1,
      completedRounds: 1,
      progress: 0.25,
      isComplete: false,
    })
    expect(deriveTimer(session({ mode: 'amrap', durationMs: 60_000 }), 61_000)).toEqual({
      elapsedMs: 60_000,
      primaryMs: 0,
      phase: 'finished',
      round: 0,
      completedRounds: 0,
      progress: 1,
      isComplete: true,
    })
  })

  it('freezes elapsed time while paused', () => {
    const paused = session(
      { mode: 'forTime' },
      { status: 'paused', pauseStartedAt: 11_000, accumulatedPausedMs: 2_000 },
    )
    expect(elapsedSessionMs(paused, 50_000)).toBe(8_000)
    expect(elapsedSessionMs(session({ mode: 'forTime' }), 500)).toBe(0)
    expect(
      elapsedSessionMs(
        session({ mode: 'forTime' }, { status: 'completed', finishedAt: 20_000 }),
        50_000,
      ),
    ).toBe(19_000)
    expect(
      elapsedSessionMs(
        session({ mode: 'forTime' }, { status: 'cancelled', finishedAt: 12_000 }),
        50_000,
      ),
    ).toBe(11_000)
    expect(elapsedSessionMs(session({ mode: 'forTime' }), 6_000)).toBe(5_000)
    // A row that is still running but carries a finishedAt — reachable, since
    // the schema makes the key optional and IndexedDB is untrusted input. The
    // clock keeps running; only a finished status freezes it.
    expect(elapsedSessionMs(session({ mode: 'forTime' }, { finishedAt: 3_000 }), 50_000)).toBe(
      49_000,
    )
  })

  it('derives uncapped, capped, and stored-complete For Time states', () => {
    expect(deriveTimer(session({ mode: 'forTime' }), 6_000)).toEqual({
      elapsedMs: 5_000,
      primaryMs: 5_000,
      phase: 'work',
      round: 0,
      completedRounds: 0,
      totalRounds: undefined,
      progress: 0,
      isComplete: false,
    })
    expect(
      deriveTimer(
        session(
          { mode: 'forTime', timeCapMs: 10_000, targetRounds: 5 },
          { rounds: [{ capturedAtElapsedMs: 3_000 }, { capturedAtElapsedMs: 6_000 }] },
        ),
        6_000,
      ),
    ).toEqual({
      elapsedMs: 5_000,
      primaryMs: 5_000,
      phase: 'work',
      round: 2,
      completedRounds: 2,
      totalRounds: 5,
      progress: 0.5,
      isComplete: false,
    })
    expect(deriveTimer(session({ mode: 'forTime', timeCapMs: 10_000 }), 16_000)).toMatchObject({
      elapsedMs: 10_000,
      primaryMs: 10_000,
      phase: 'finished',
      progress: 1,
      isComplete: true,
    })
    expect(
      deriveTimer(session({ mode: 'forTime' }, { status: 'completed', finishedAt: 8_000 }), 20_000),
    ).toMatchObject({ phase: 'finished', elapsedMs: 7_000, isComplete: true })
    // Cancelled is as final as completed — the result screen reads this flag.
    expect(
      deriveTimer(session({ mode: 'forTime' }, { status: 'cancelled', finishedAt: 8_000 }), 20_000),
    ).toMatchObject({ phase: 'finished', elapsedMs: 7_000, isComplete: true })
    // Exactly at the cap, not merely past it.
    expect(deriveTimer(session({ mode: 'forTime', timeCapMs: 10_000 }), 11_000)).toMatchObject({
      elapsedMs: 10_000,
      phase: 'finished',
      isComplete: true,
    })
  })

  it('moves EMOM to the next round at the exact boundary', () => {
    const emom = session({ mode: 'emom', intervalMs: 60_000, rounds: 10 })
    expect(deriveTimer(emom, 31_000)).toEqual({
      elapsedMs: 30_000,
      primaryMs: 30_000,
      phase: 'work',
      round: 1,
      completedRounds: 0,
      totalRounds: 10,
      progress: 0.5,
      isComplete: false,
    })
    expect(deriveTimer(emom, 60_999).round).toBe(1)
    const boundary = deriveTimer(emom, 61_000)
    expect(boundary.round).toBe(2)
    expect(boundary.primaryMs).toBe(60_000)
    expect(boundary.progress).toBe(0)
    expect(deriveTimer(emom, 601_000)).toEqual({
      elapsedMs: 600_000,
      primaryMs: 0,
      phase: 'finished',
      round: 10,
      completedRounds: 10,
      totalRounds: 10,
      progress: 1,
      isComplete: true,
    })
  })

  it('alternates Tabata work and rest without a final rest', () => {
    const tabata = session({ mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 2 })
    expect(totalDurationMs(tabata.config)).toBe(50_000)
    expect(deriveTimer(tabata, 11_000)).toMatchObject({
      elapsedMs: 10_000,
      primaryMs: 10_000,
      phase: 'work',
      round: 1,
      totalRounds: 2,
      progress: 0.5,
      isComplete: false,
    })
    expect(deriveTimer(tabata, 21_000)).toMatchObject({
      primaryMs: 10_000,
      phase: 'rest',
      round: 1,
      progress: 0,
    })
    expect(deriveTimer(tabata, 31_000)).toMatchObject({
      primaryMs: 20_000,
      phase: 'work',
      round: 2,
      progress: 0,
    })
    expect(deriveTimer(tabata, 51_000)).toEqual({
      elapsedMs: 50_000,
      primaryMs: 0,
      phase: 'finished',
      round: 2,
      completedRounds: 2,
      totalRounds: 2,
      progress: 1,
      isComplete: true,
    })
  })

  it('counts structural rounds from elapsed time, not tapped splits', () => {
    // The bug this pins: a stored-final Tabata has an empty splits array, so
    // result screens reading `session.rounds.length` showed 0. 4 × 4:00 work
    // with 3:00 rests between is 25:00 — and 4 completed rounds.
    const longTabata: TimerConfig = { mode: 'tabata', workMs: 240_000, restMs: 180_000, rounds: 4 }
    expect(
      deriveTimer(session(longTabata, { status: 'completed', finishedAt: 1_501_000 }), 2_000_000),
    ).toMatchObject({ elapsedMs: 1_500_000, completedRounds: 4 })
    // Cancelled during the second work phase: only the first round is done —
    // a stored-final status must not inflate the count to the configured 4.
    expect(
      deriveTimer(session(longTabata, { status: 'cancelled', finishedAt: 481_000 }), 2_000_000),
    ).toMatchObject({ completedRounds: 1 })

    // A round is finished exactly when its work phase ends; the rest after it
    // adds nothing, and a clock far past the endpoint never counts beyond the
    // configured rounds.
    const tabata = session({ mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 2 })
    expect(deriveTimer(tabata, 20_999).completedRounds).toBe(0)
    expect(deriveTimer(tabata, 21_000).completedRounds).toBe(1)
    expect(deriveTimer(tabata, 30_999).completedRounds).toBe(1)
    expect(deriveTimer(tabata, 200_000).completedRounds).toBe(2)

    const emom = session({ mode: 'emom', intervalMs: 60_000, rounds: 10 })
    expect(deriveTimer(emom, 60_999).completedRounds).toBe(0)
    expect(deriveTimer(emom, 61_000).completedRounds).toBe(1)
    expect(deriveTimer(emom, 2_000_000).completedRounds).toBe(10)
  })

  it('formats phone-friendly clocks', () => {
    expect(formatDuration(-1)).toBe('00:00')
    expect(formatDuration(999)).toBe('00:00')
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(3_665_000)).toBe('01:01:05')
    expect(formatDuration(9_900, true)).toBe('00:09.9')
  })

  it('sorts copies of presets and sessions newest first', () => {
    const presets: Array<TimerPreset> = [
      {
        id: 'old',
        name: 'Old',
        config: { mode: 'forTime' },
        workoutNotes: '',
        createdAt: 1,
        updatedAt: 10,
      },
      {
        id: 'used',
        name: 'Used',
        config: { mode: 'forTime' },
        workoutNotes: '',
        createdAt: 2,
        updatedAt: 5,
        lastUsedAt: 20,
      },
    ]
    const sessions = [
      session({ mode: 'forTime' }, { id: 'old', createdAt: 1 }),
      session({ mode: 'forTime' }, { id: 'new', createdAt: 2 }),
    ]
    expect(sortPresets(presets).map(({ id }) => id)).toEqual(['used', 'old'])
    expect(sortSessions(sessions).map(({ id }) => id)).toEqual(['new', 'old'])
    expect(presets.map(({ id }) => id)).toEqual(['old', 'used'])
    expect(sessions.map(({ id }) => id)).toEqual(['old', 'new'])
  })
})

/**
 * The vocabulary the screens share: which modes exist, which statuses are
 * still running, and what a finished workout came to. Each of these used to
 * be an array literal or a `?? Date.now()` spelled out in four `<script setup>`
 * blocks, so what these tests really pin is that there is now one answer.
 */
describe('timer vocabulary', () => {
  it('lists every mode, in the order the home screen offers them', () => {
    expect(TIMER_MODES).toEqual(['amrap', 'forTime', 'emom', 'tabata'])
  })

  /**
   * The list is read off `DEFAULT_CONFIGS`, which is keyed by `TimerMode` — so
   * this is the assertion that a mode added to the type cannot go missing from
   * the screens. It fails the moment the two disagree.
   */
  it('covers exactly the modes that have a default config', () => {
    expect([...TIMER_MODES].sort()).toEqual(Object.keys(DEFAULT_CONFIGS).sort())
    expect(TIMER_MODES.every((mode) => DEFAULT_CONFIGS[mode].mode === mode)).toBe(true)
  })

  it('parses a route param into a mode, and nothing else into one', () => {
    expect(TIMER_MODES.map(parseTimerMode)).toEqual([...TIMER_MODES])
    for (const value of ['', 'AMRAP', 'sprint', undefined, null, 3, ['amrap']]) {
      expect(parseTimerMode(value)).toBeUndefined()
    }
  })

  /**
   * Running and finished partition the statuses. A sixth status that belongs
   * to neither would leave a workout that history will not list and the home
   * screen will not offer to resume — invisible in the app, still on disk.
   */
  it('sorts every status into exactly one of running or finished', () => {
    for (const status of SESSION_STATUSES) {
      expect(isActiveSession(status) !== isFinishedSession(status)).toBe(true)
    }
    expect(SESSION_STATUSES.filter(isActiveSession)).toEqual(['countdown', 'running', 'paused'])
    expect(SESSION_STATUSES.filter(isFinishedSession)).toEqual(['completed', 'cancelled'])
  })

  /**
   * Splits are tapped in exactly the modes whose `completedRounds` counts taps.
   * The run screen offers "Add round" off this rule, so a mode on the wrong
   * side of it would either hide the button or record splits nothing reads.
   */
  it('offers round splits exactly where completedRounds counts them', () => {
    const rounds = [{ capturedAtElapsedMs: 1_000 }]

    for (const mode of TIMER_MODES) {
      const stored = session(DEFAULT_CONFIGS[mode], {
        rounds,
        status: 'completed',
        finishedAt: 2_000,
      })
      const countsTaps = finalResult(stored).completedRounds === rounds.length

      expect(capturesRoundSplits(mode)).toBe(countsTaps)
    }
  })

  it('freezes a finished workout at the moment it stopped', () => {
    const stored = session(
      { mode: 'amrap', durationMs: 60_000 },
      { status: 'completed', startedAt: 1_000, finishedAt: 31_000 },
    )

    // `now` moving must not move the result — that is the whole point of
    // reading `finishedAt` first.
    expect(finalResult(stored, 40_000)).toEqual(finalResult(stored, 9_000_000))
    expect(finalResult(stored, 40_000).elapsedMs).toBe(30_000)
    expect(finalResult(stored, 40_000)).toEqual(deriveTimer(stored, 31_000))
  })

  /** A row still open is graded against the clock, since it has no end yet. */
  it('falls back to now for a session that never finished', () => {
    const open = session({ mode: 'amrap', durationMs: 60_000 }, { startedAt: 1_000 })

    expect(finalResult(open, 21_000)).toEqual(deriveTimer(open, 21_000))
  })
})

/**
 * The same three functions again, said as properties: true of every input
 * rather than of the hand-picked ones above. Both kinds stay — the examples
 * pin the boundaries that must not move and read better when they fail, the
 * properties pin the definition.
 *
 * The generators come from the schemas in `converters.ts`, not from
 * hand-written arbitraries, so a bound that moves there moves here too. That
 * makes each of these a test of the schema as well.
 */
describe('timer domain, as properties', () => {
  // Bounded: the shapes matter, the array length does not, and a hundred runs
  // over hundred-element arrays would cost more than this tier is allowed.
  // `it.prop` types a Schema as a valid arbitrary but rejects one at runtime in
  // 4.0.0-beta.105, so the conversion is explicit.
  const anySessions = Schema.toArbitrary(
    Schema.Array(WorkoutSessionSchema).check(Schema.isMaxLength(6)),
  )
  const anyPresets = Schema.toArbitrary(
    Schema.Array(TimerPresetSchema).check(Schema.isMaxLength(6)),
  )

  const presetKey = (preset: TimerPreset): number => preset.lastUsedAt ?? preset.updatedAt

  /** Sorting is a reordering: same rows out as in, and the caller's array untouched. */
  function expectReordering<A>(sorted: ReadonlyArray<A>, input: ReadonlyArray<A>): void {
    expect(sorted).toHaveLength(input.length)
    expect(input.every((row) => sorted.includes(row))).toBe(true)
    expect(sorted).not.toBe(input)
  }

  it.prop('sortSessions reorders sessions newest first', [anySessions], ([sessions]) => {
    const untouched = [...sessions]
    const sorted = sortSessions(sessions)

    expectReordering(sorted, sessions)
    expect([...sessions]).toEqual(untouched)

    const createdAt = sorted.map((session) => session.createdAt)
    expect(createdAt).toEqual([...createdAt].sort((a, b) => b - a))
  })

  it.prop('sortPresets reorders presets most-recently-used first', [anyPresets], ([presets]) => {
    const untouched = [...presets]
    const sorted = sortPresets(presets)

    expectReordering(sorted, presets)
    expect([...presets]).toEqual(untouched)

    const keys = sorted.map(presetKey)
    expect(keys).toEqual([...keys].sort((a, b) => b - a))
  })

  /**
   * Agreement. `isTimerConfig` grades a setup form's in-progress value, so it
   * restates the schema's bounds in plain TypeScript instead of decoding — and
   * two statements of one rule drift. When they do, the form offers a Start
   * button for a workout the repository will refuse to store.
   *
   * Values cluster on the boundaries, because that is the only place the two
   * can disagree; a uniform integer would spend its hundred runs in the middle.
   */
  const nearMissNumber = FastCheck.constantFrom(
    -1,
    0,
    0.5,
    1,
    999,
    999.5,
    1_000,
    1_000.5,
    1_001,
    998,
    1_002,
    86_399_999,
    86_400_000,
    86_400_001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 2,
  )

  const validConfig = Schema.toArbitrary(TimerConfigSchema)

  /**
   * The discriminating input: a config the schema would accept, with exactly
   * one field knocked off its bound. Drawing every field independently — the
   * obvious generator — is close to useless here, because some *other* field is
   * almost always invalid too, both sides reject for that reason, and a broken
   * bound never gets asked about. Perturbing one field at a time is what makes
   * the property notice.
   */
  const oneFieldOff = validConfig.chain((config) => {
    const fields = Object.keys(config).filter((field) => field !== 'mode')
    if (fields.length === 0) return FastCheck.constant(config)

    return FastCheck.tuple(FastCheck.constantFrom(...fields), nearMissNumber).map(
      ([field, value]) => ({ ...config, [field]: value }) as TimerConfig,
    )
  })

  /**
   * Optional keys are omitted, never set to `undefined`, which is the honest
   * generator: `Schema.optionalKey` accepts an absent key and rejects a
   * present-but-undefined one, while `isTimerConfig` cannot tell the two apart.
   * Generating the second would report a divergence that `TimerConfig` already
   * makes unrepresentable.
   */
  const nearMissConfig = FastCheck.oneof(
    FastCheck.record({ mode: FastCheck.constant('amrap' as const), durationMs: nearMissNumber }),
    FastCheck.record(
      {
        mode: FastCheck.constant('forTime' as const),
        timeCapMs: nearMissNumber,
        targetRounds: nearMissNumber,
      },
      { requiredKeys: ['mode'] },
    ),
    FastCheck.record({
      mode: FastCheck.constant('emom' as const),
      intervalMs: nearMissNumber,
      rounds: nearMissNumber,
    }),
    FastCheck.record({
      mode: FastCheck.constant('tabata' as const),
      workMs: nearMissNumber,
      restMs: nearMissNumber,
      rounds: nearMissNumber,
    }),
  )

  // Every direction in one generator: what the store holds, what misses it by
  // one field, and what misses it entirely. Either side rejecting alone is a
  // divergence.
  const anyConfig = FastCheck.oneof(validConfig, oneFieldOff, nearMissConfig)
  const decodeConfig = Schema.decodeUnknownResult(TimerConfigSchema)

  it.prop(
    'isTimerConfig accepts exactly the configs the schema stores',
    [anyConfig],
    ([config]) => {
      expect(isTimerConfig(config)).toBe(Result.isSuccess(decodeConfig(config)))
    },
    // A single bound is one cell of mode × field × value; a hundred runs leave
    // too many of them unvisited to be a gate.
    { fastCheck: { numRuns: 1_000 } },
  )
})
