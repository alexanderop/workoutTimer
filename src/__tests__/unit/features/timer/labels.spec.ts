import { describe, expect, it } from '@effect/vitest'
import { DEFAULT_CONFIGS, TIMER_MODES } from '@/features/timer/domain'
import {
  configSummary,
  humanizeSeconds,
  modeDescription,
  modeName,
  phaseName,
  type Translate,
} from '@/features/timer/labels'
import en from '@/i18n/messages/en'
import type { TimerPhase } from '@/features/timer/domain'
import type { TimerConfig } from '@/db'

/**
 * A `Record` keyed on the union rather than an array of it: an array typed as
 * `TimerPhase[]` is satisfied by a list missing three of them, and a phase
 * this file forgot is exactly the failure being guarded against. A fifth
 * phase is a missing key here, which is a compile error.
 */
const PHASE_LABELS: Record<TimerPhase, string> = {
  countdown: 'Get ready',
  work: 'Work',
  rest: 'Rest',
  finished: 'Done',
}

/**
 * The real English catalogue, walked by key. Using it rather than a stub is
 * what makes these tests catch a key that does not exist — the thing five
 * hand-written `switch (mode)` blocks could get wrong one mode at a time.
 */
const translate: Translate = (key, named) => {
  const message = key
    .split('.')
    .reduce<unknown>(
      (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
      en,
    )

  if (typeof message !== 'string') throw new Error(`no message at ${key}`)

  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(named?.[name] ?? `{${name}}`))
}

/**
 * Every phase, including the one the run screen used to get wrong. It answered
 * this with its own `switch` and a `default:`, so `finished` — a real phase, a
 * completing workout sits in it until the result screen takes over — was read
 * out as "Work" inside an `aria-live` region. Walking the union is what makes
 * a missing message a failure here rather than a wrong label there.
 */
describe('phase names', () => {
  it.each(Object.entries(PHASE_LABELS))('names %s from the catalogue', (phase, label) => {
    expect(phaseName(phase as TimerPhase, translate)).toBe(label)
  })

  it('gives the end of a workout a name of its own', () => {
    expect(phaseName('finished', translate)).not.toBe(phaseName('work', translate))
  })
})

describe('timer labels', () => {
  it('names and describes every mode from the catalogue', () => {
    expect(TIMER_MODES.map((mode) => modeName(mode, translate))).toEqual([
      'AMRAP',
      'For Time',
      'EMOM',
      'Tabata',
    ])
    expect(TIMER_MODES.map((mode) => modeDescription(mode, translate))).toEqual([
      'As many rounds as possible',
      'Finish the work as fast as you can',
      'Start work on every interval',
      'Alternate focused work and rest',
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
