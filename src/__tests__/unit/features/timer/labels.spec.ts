import { describe, expect, it } from '@effect/vitest'
import { DEFAULT_CONFIGS, HISTORY_FILTERS, TIMER_MODES } from '@/features/timer/domain'
import {
  configSummary,
  historyFilterName,
  humanizeSeconds,
  modeDescription,
  modeName,
  runPhaseName,
  type Translate,
} from '@/features/timer/labels'
import en from '@/i18n/messages/en'
import type { TimerConfig } from '@/db'
import type { DerivedTimer, TimerPhase } from '@/features/timer/domain'
import { messageAt } from '../../../helpers/messageAt'

/**
 * The real English catalogue, walked by key. Using it rather than a stub is
 * what makes these tests catch a key that does not exist — the thing five
 * hand-written `switch (mode)` blocks could get wrong one mode at a time.
 */
const translate: Translate = (key, named) =>
  messageAt(en, key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(named?.[name] ?? `{${name}}`),
  )

describe('timer labels', () => {
  it('names and describes every mode from the catalogue', () => {
    expect(TIMER_MODES.map((mode) => modeName(mode, translate))).toEqual([
      'AMRAP',
      'For Time',
      'EMOM',
      'Tabata',
      'Circuit',
    ])
    expect(TIMER_MODES.map((mode) => modeDescription(mode, translate))).toEqual([
      'As many rounds as possible',
      'Finish the work as fast as you can',
      'Start work on every interval',
      'Alternate focused work and rest',
      'Build your own sequence of blocks',
    ])
  })

  /**
   * A missing key throws in `translate` above, so this covers the case a
   * template-literal key type cannot: a mode whose messages were never
   * written.
   */
  it('has a name and a description for each mode, with no key left unwritten', () => {
    for (const mode of TIMER_MODES) {
      expect(modeName(mode, translate)).not.toBe('')
      expect(modeDescription(mode, translate)).not.toBe('')
    }
  })

  it('summarises each mode by what it will actually do', () => {
    const summarise = (config: TimerConfig) => configSummary(config, translate)

    expect(summarise({ mode: 'amrap', durationMs: 600_000 })).toBe('10:00')
    expect(summarise({ mode: 'forTime', timeCapMs: 900_000 })).toBe('15:00')
    expect(summarise({ mode: 'emom', intervalMs: 60_000, rounds: 12 })).toBe('12 × 01:00')
    expect(summarise({ mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 8 })).toBe(
      '8 × 00:20 / 00:10',
    )
    // A circuit reads as repeats × one pass through the blocks.
    expect(
      summarise({
        mode: 'custom',
        blocks: [
          { label: '', kind: 'work', durationMs: 30_000 },
          { label: '', kind: 'rest', durationMs: 15_000 },
        ],
        repeat: 3,
      }),
    ).toBe('3 × 00:45')
  })

  /**
   * The branch the three copies of this function disagreed about: an uncapped
   * For Time has no duration to show, so it borrows the mode's description
   * rather than printing "00:00", which would read as a finished workout.
   */
  it('falls back to the mode description for a For Time with no cap', () => {
    expect(configSummary({ mode: 'forTime' }, translate)).toBe(
      modeDescription('forTime', translate),
    )
    expect(configSummary({ mode: 'forTime', targetRounds: 5 }, translate)).toBe(
      modeDescription('forTime', translate),
    )
  })

  it('summarises every default config without reaching for a missing key', () => {
    for (const mode of TIMER_MODES) {
      expect(configSummary(DEFAULT_CONFIGS[mode], translate)).not.toBe('')
    }
  })

  it('humanises a picker value, dropping the parts that are zero', () => {
    expect(humanizeSeconds(0, translate)).toBe('0 sec')
    expect(humanizeSeconds(45, translate)).toBe('45 sec')
    expect(humanizeSeconds(60, translate)).toBe('1 min')
    expect(humanizeSeconds(90, translate)).toBe('1 min 30 sec')
    expect(humanizeSeconds(3_600, translate)).toBe('1 hr')
    expect(humanizeSeconds(3_661, translate)).toBe('1 hr 1 min 1 sec')
    // An hour and a minute: the seconds part is dropped, not rendered as 0.
    expect(humanizeSeconds(3_660, translate)).toBe('1 hr 1 min')
    expect(humanizeSeconds(86_400, translate)).toBe('24 hr')
  })
})

describe('the running timer in one word', () => {
  const timer = (patch: Partial<DerivedTimer>): DerivedTimer => ({
    elapsedMs: 0,
    primaryMs: 0,
    remainingMs: 0,
    phase: 'work',
    round: 1,
    completedRounds: 0,
    progress: 0,
    isComplete: false,
    ...patch,
  })

  /**
   * A `Record` keyed on the union rather than an array of it: an array typed
   * as `TimerPhase[]` is satisfied by a list missing three of them, and a
   * phase this file forgot is exactly the failure being guarded against. A
   * fifth phase is a missing key here, which is a compile error.
   */
  const PHASE_WORDS = {
    countdown: 'Get ready',
    work: 'Work',
    rest: 'Rest',
    finished: 'Done',
  } satisfies Record<TimerPhase, string>

  // SAFETY: PHASE_WORDS satisfies Record<TimerPhase, string>, so its keys are
  // exactly the phases; `Object.entries` is what widens them back to `string`.
  const PHASE_CASES = Object.entries(PHASE_WORDS) as Array<[TimerPhase, string]>

  it.each(PHASE_CASES)('names the %s phase from the catalogue', (phase, word) => {
    expect(runPhaseName('running', timer({ phase }), translate)).toBe(word)
  })

  it('lets paused win over the phase, and a named block win over the word', () => {
    expect(runPhaseName('paused', timer({ phase: 'rest' }), translate)).toBe('Paused')
    expect(runPhaseName('paused', timer({ phaseLabel: 'Burpees' }), translate)).toBe('Paused')
    expect(runPhaseName('running', timer({ phase: 'rest', phaseLabel: 'Walk' }), translate)).toBe(
      'Walk',
    )
  })

  it('gives the end of a workout a word of its own', () => {
    // The run screen holds this word only until the driver navigates to the
    // result screen — but it sits in an `aria-live` region, so that instant is
    // announced, and "Work" is the one reading of it that is simply wrong.
    expect(runPhaseName('completed', timer({ phase: 'finished' }), translate)).toBe('Done')
    expect(runPhaseName('completed', timer({ phase: 'finished' }), translate)).not.toBe(
      runPhaseName('running', timer({ phase: 'work' }), translate),
    )
  })

  it('falls back to the work word before the row arrives', () => {
    expect(runPhaseName(undefined, undefined, translate)).toBe('Work')
  })
})

describe('history filters', () => {
  it('labels every filter the screen offers', () => {
    expect(HISTORY_FILTERS.map((filter) => historyFilterName(filter, translate))).toEqual([
      'All',
      'Completed',
      'Cancelled',
    ])
  })
})
