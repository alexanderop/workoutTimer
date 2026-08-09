import { DEFAULT_CONFIGS, SECOND_MS, TIMER_MODES } from './domain'
import type { TimerConfig, TimerMode } from '@/db'

/**
 * The setup screen's form, as data and two pure functions over it.
 *
 * A `TimerConfig` is a discriminated union in milliseconds; the form is a flat
 * set of fields in seconds, because that is what a picker binds to and what a
 * person thinks in. Something has to translate, and that translation was 90
 * lines of `<script setup>` — the trickiest logic on the screen, and the only
 * part of it no test could reach.
 *
 * The fields are flat and shared rather than one set per mode, so switching
 * mode keeps what you had configured for the other one. That is why applying a
 * config *patches* the values instead of replacing them: an AMRAP config has
 * nothing to say about Tabata's rest, and should not reset it.
 */
// Not `readonly`: this is what the pickers `v-model` into. The functions
// below never mutate it — they return a new one — but the screen does.
export interface SetupFormValues {
  durationSeconds: number
  timeCapSeconds: number | undefined
  targetRounds: number | undefined
  intervalSeconds: number
  rounds: number
  workSeconds: number
  restSeconds: number
}

export const MAX_DURATION_SECONDS = 24 * 60 * 60

const toSeconds = (milliseconds: number): number => milliseconds / SECOND_MS
const toMilliseconds = (seconds: number): number => Math.round(seconds * SECOND_MS)

/** The fields a config has an opinion about, in seconds. The rest are left alone. */
export function applyConfigToValues(values: SetupFormValues, config: TimerConfig): SetupFormValues {
  switch (config.mode) {
    case 'amrap':
      return { ...values, durationSeconds: toSeconds(config.durationMs) }
    case 'forTime':
      return {
        ...values,
        timeCapSeconds: config.timeCapMs === undefined ? undefined : toSeconds(config.timeCapMs),
        targetRounds: config.targetRounds,
      }
    case 'emom':
      return {
        ...values,
        intervalSeconds: toSeconds(config.intervalMs),
        rounds: config.rounds,
      }
    case 'tabata':
      return {
        ...values,
        workSeconds: toSeconds(config.workMs),
        restSeconds: toSeconds(config.restMs),
        rounds: config.rounds,
      }
  }
}

const NOTHING_SET: SetupFormValues = {
  durationSeconds: 0,
  timeCapSeconds: undefined,
  targetRounds: undefined,
  intervalSeconds: 0,
  rounds: 0,
  workSeconds: 0,
  restSeconds: 0,
}

/**
 * Every field holding its own mode's default, folded out of `DEFAULT_CONFIGS`
 * rather than written out again — the numbers have one home.
 *
 * Where two modes share a field (`rounds`), the last one folded wins. It does
 * not matter which: the screen seeds the mode it is showing before it renders,
 * so these values are only ever the starting point for the modes it is not.
 */
export function defaultFormValues(): SetupFormValues {
  return TIMER_MODES.reduce<SetupFormValues>(
    (values, mode) => applyConfigToValues(values, DEFAULT_CONFIGS[mode]),
    NOTHING_SET,
  )
}

/**
 * The form read back as the config for one mode. The other modes' fields are
 * ignored, so what the user set for Tabata does not leak into the AMRAP they
 * are about to start.
 *
 * A zero-valued optional means "not set" — the For Time pickers offer an empty
 * option, and an empty option that produced `timeCapMs: 0` would be a workout
 * that ends the instant it starts. The test is `undefined` or `0` and not
 * falsiness on purpose: any other unusable value has to reach the config, so
 * that `isTimerConfig` can refuse it out loud rather than have it read as
 * "no cap" and start an uncapped workout.
 */
export function configFromValues(mode: TimerMode, values: SetupFormValues): TimerConfig {
  switch (mode) {
    case 'amrap':
      return { mode: 'amrap', durationMs: toMilliseconds(values.durationSeconds) }
    case 'forTime': {
      const { timeCapSeconds, targetRounds } = values

      return {
        mode: 'forTime',
        ...(timeCapSeconds === undefined || timeCapSeconds === 0
          ? {}
          : { timeCapMs: toMilliseconds(timeCapSeconds) }),
        ...(targetRounds === undefined || targetRounds === 0
          ? {}
          : { targetRounds: Math.round(targetRounds) }),
      }
    }
    case 'emom':
      return {
        mode: 'emom',
        intervalMs: toMilliseconds(values.intervalSeconds),
        rounds: Math.round(values.rounds),
      }
    case 'tabata':
      return {
        mode: 'tabata',
        workMs: toMilliseconds(values.workSeconds),
        restMs: toMilliseconds(values.restSeconds),
        rounds: Math.round(values.rounds),
      }
  }
}

/**
 * What the form is currently editing — a mode, optionally a stored preset.
 *
 * The seed watcher keys on this rather than on the preset data, and that
 * distinction is load-bearing: see `useTimerSetupForm`.
 */
export function seedKey(mode: TimerMode, presetId: string | undefined): string {
  return `${mode}:${presetId ?? ''}`
}
