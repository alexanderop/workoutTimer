import { circuitCycleMs, formatDuration } from './domain'
import type { DerivedTimer, HistoryFilter, TimerPhase } from './domain'
import type { SessionStatus, TimerConfig, TimerMode } from '@/db'

/**
 * How a timer reads to a human — the mode's name, what a config comes to, how
 * long a picker value is.
 *
 * Every screen that shows a timer needed these, and every screen wrote its own
 * `switch (mode)`: five copies of the mode names and three of the config
 * summary, one of which had already drifted. They live here as pure functions
 * over a `translate`, so the unit tier can hold them without a component.
 *
 * A screen calls them from its template with its own `t` — they are derived
 * from arguments and translations only, which is exactly the case the state
 * rules say is a plain function rather than a memo, and so there is nothing
 * here for a composable to wrap.
 *
 * Keys are built with template literals off `TimerMode`, which is what makes a
 * new mode a compile error here rather than a missing string at runtime: the
 * key type widens, and `MessageSchema` has no entry for it.
 */

type ModeKey = `timer.modes.${TimerMode}.${'name' | 'description'}`
type UnitKey = `timer.setup.units.${'hoursShort' | 'minutesShort' | 'secondsShort'}`
type RunPhaseKey = `timer.run.${'paused' | RunPhaseWord}`
type HistoryFilterKey = `history.${HistoryFilter}`

/**
 * The slice of vue-i18n's `t` these functions use. `t` accepts every key in
 * the catalogue, so it satisfies this narrower one — and nothing here can
 * reach for a key outside the set.
 */
export type Translate = (
  key: ModeKey | UnitKey | RunPhaseKey | HistoryFilterKey,
  named?: Record<string, number>,
) => string

export function modeName(mode: TimerMode, t: Translate): string {
  return t(`timer.modes.${mode}.name`)
}

export function modeDescription(mode: TimerMode, t: Translate): string {
  return t(`timer.modes.${mode}.description`)
}

/**
 * One line describing what a config will do — under a preset's name, under a
 * history row, beside a workout's details.
 *
 * A For Time workout without a cap has no duration to show, so it borrows the
 * mode's own description. That branch is the one the three copies of this
 * function disagreed about.
 */
export function configSummary(config: TimerConfig, t: Translate): string {
  switch (config.mode) {
    case 'amrap':
      return formatDuration(config.durationMs)
    case 'forTime':
      return config.timeCapMs === undefined
        ? modeDescription('forTime', t)
        : formatDuration(config.timeCapMs)
    case 'emom':
      return `${config.rounds} × ${formatDuration(config.intervalMs)}`
    case 'tabata':
      return `${config.rounds} × ${formatDuration(config.workMs)} / ${formatDuration(config.restMs)}`
    case 'custom':
      return `${config.repeat} × ${formatDuration(circuitCycleMs(config.blocks))}`
  }
}

/**
 * A picker option's label: "1 hr 30 min", not "01:30:00".
 *
 * Zero-valued parts are dropped, because a duration picker offering "0 hr 20
 * min 0 sec" reads like a bug — except for a plain zero, which has to say
 * something, and says "0 sec".
 */
export function humanizeSeconds(seconds: number, t: Translate): string {
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainingSeconds = seconds % 60
  const parts: Array<string> = []

  if (hours > 0) parts.push(t('timer.setup.units.hoursShort', { count: hours }))
  if (minutes > 0) parts.push(t('timer.setup.units.minutesShort', { count: minutes }))
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(t('timer.setup.units.secondsShort', { count: remainingSeconds }))
  }

  return parts.join(' ')
}

/**
 * The word the run screen shows over the clock, per phase.
 *
 * A record rather than a `switch`, and keyed by `TimerPhase`, so a sixth phase
 * is a compile error here instead of a screen quietly showing "Work". The
 * finished phase maps to the work word because the run screen only holds it
 * for the instant between `deriveTimer` reporting completion and the driver
 * navigating to the result screen — the result screen is what actually says a
 * workout is over.
 */
type RunPhaseWord = 'countdown' | 'rest' | 'work'

const RUN_PHASE_WORDS: Readonly<Record<TimerPhase, RunPhaseWord>> = {
  countdown: 'countdown',
  rest: 'rest',
  work: 'work',
  finished: 'work',
}

/**
 * What the running timer is doing, in one word: paused beats everything, a
 * named circuit block says what to do, and the phase's own word is the
 * fallback. `undefined` for either argument is the moment before the session
 * row has arrived, which reads as the work phase — the screen renders its
 * "workout not found" branch instead in that case, so the word is never seen.
 */
export function runPhaseName(
  status: SessionStatus | undefined,
  timer: DerivedTimer | undefined,
  t: Translate,
): string {
  if (status === 'paused') return t('timer.run.paused')
  if (timer?.phaseLabel !== undefined) return timer.phaseLabel
  return t(`timer.run.${RUN_PHASE_WORDS[timer?.phase ?? 'work']}`)
}

/**
 * A history filter chip's label, keyed by the filter itself rather than by a
 * chain of comparisons — so the `HISTORY_FILTERS` list and the translations
 * are one thing rather than two that have to agree.
 *
 * The compiler cannot help here the way it does for `modeName`: `t` accepts
 * every key in the catalogue, so it satisfies this narrower signature whether
 * or not `history.<filter>` exists. The labels spec is what closes that — it
 * walks `HISTORY_FILTERS` against the real English catalogue, so a new
 * finished status without a message fails there.
 */
export function historyFilterName(filter: HistoryFilter, t: Translate): string {
  return t(`history.${filter}`)
}
