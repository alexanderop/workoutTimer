import { formatDuration } from './domain'
import type { TimerConfig, TimerMode } from '@/db'

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

/**
 * The slice of vue-i18n's `t` these functions use. `t` accepts every key in
 * the catalogue, so it satisfies this narrower one — and nothing here can
 * reach for a key outside the set.
 */
export type Translate = (key: ModeKey | UnitKey, named?: Record<string, number>) => string

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
