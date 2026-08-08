import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIGS,
  deriveTimer,
  elapsedSessionMs,
  formatDuration,
  isTimerConfig,
  MINUTE_MS,
  sortPresets,
  sortSessions,
  totalDurationMs,
} from '@/features/timer/domain'
import type { TimerConfig, TimerPreset, WorkoutSession } from '@/types/workout'

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
      progress: 0.25,
      isComplete: false,
    })
    expect(deriveTimer(session({ mode: 'amrap', durationMs: 60_000 }), 61_000)).toEqual({
      elapsedMs: 60_000,
      primaryMs: 0,
      phase: 'finished',
      round: 0,
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
  })

  it('derives uncapped, capped, and stored-complete For Time states', () => {
    expect(deriveTimer(session({ mode: 'forTime' }), 6_000)).toEqual({
      elapsedMs: 5_000,
      primaryMs: 5_000,
      phase: 'work',
      round: 0,
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
  })

  it('moves EMOM to the next round at the exact boundary', () => {
    const emom = session({ mode: 'emom', intervalMs: 60_000, rounds: 10 })
    expect(deriveTimer(emom, 31_000)).toEqual({
      elapsedMs: 30_000,
      primaryMs: 30_000,
      phase: 'work',
      round: 1,
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
      totalRounds: 2,
      progress: 1,
      isComplete: true,
    })
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
