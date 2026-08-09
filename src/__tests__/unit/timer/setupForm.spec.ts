import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { DEFAULT_CONFIGS, isTimerConfig, TIMER_MODES } from '@/features/timer/domain'
import {
  applyConfigToValues,
  configFromValues,
  defaultFormValues,
  seedKey,
  type SetupFormValues,
} from '@/features/timer/setupForm'
import { TimerConfigSchema } from '@/db/converters'
import type { TimerConfig } from '@/db'

describe('setup form', () => {
  /** What the screen does on arrival: start from the defaults, seed the mode shown. */
  it('seeds a mode from its default and reads that default back', () => {
    for (const mode of TIMER_MODES) {
      const seeded = applyConfigToValues(defaultFormValues(), DEFAULT_CONFIGS[mode])

      expect(configFromValues(mode, seeded)).toEqual(DEFAULT_CONFIGS[mode])
    }
  })

  /**
   * EMOM and Tabata bind the same `rounds` field, which is why switching
   * between them keeps the count rather than resetting it — and why
   * `defaultFormValues` cannot hold both modes' default at once. It does not
   * have to: the screen seeds the mode it is showing before it renders.
   */
  it('shares the round count between EMOM and Tabata', () => {
    const values = applyConfigToValues(defaultFormValues(), {
      mode: 'emom',
      intervalMs: 60_000,
      rounds: 15,
    })
    const asTabata = configFromValues('tabata', values)

    expect(asTabata.mode === 'tabata' && asTabata.rounds).toBe(15)
    expect(defaultFormValues().durationSeconds).toBe(600)
    expect(defaultFormValues().intervalSeconds).toBe(60)
  })

  it('produces a config the repository would accept, for every mode', () => {
    const values = defaultFormValues()

    for (const mode of TIMER_MODES) {
      expect(isTimerConfig(configFromValues(mode, values))).toBe(true)
    }
  })

  /**
   * Switching mode must not disturb what was configured for the other one:
   * the fields are shared, and applying a config patches only the fields that
   * config has an opinion about.
   */
  it('leaves the other modes alone when a config is applied', () => {
    const before = defaultFormValues()
    const after = applyConfigToValues(before, { mode: 'amrap', durationMs: 1_800_000 })

    expect(after.durationSeconds).toBe(1_800)
    expect(configFromValues('tabata', after)).toEqual(configFromValues('tabata', before))
    expect(configFromValues('forTime', after)).toEqual(configFromValues('forTime', before))
  })

  it('does not mutate the values it is given', () => {
    const values = defaultFormValues()
    const snapshot = { ...values }

    applyConfigToValues(values, { mode: 'amrap', durationMs: 1_000 })

    expect(values).toEqual(snapshot)
  })

  /**
   * The empty option on the For Time pickers. A cap of "none" must not become
   * `timeCapMs: 0`, which is a workout that ends the moment it starts.
   */
  it('treats an unset optional as absent, not as zero', () => {
    const values: SetupFormValues = {
      ...defaultFormValues(),
      timeCapSeconds: undefined,
      targetRounds: 0,
    }

    expect(configFromValues('forTime', values)).toEqual({ mode: 'forTime' })
  })

  /**
   * The counterpart: a value that is neither absent nor usable has to reach
   * the config, so `isTimerConfig` disables Start and says so — rather than
   * being read as "no cap" and quietly starting an uncapped workout.
   */
  it('passes an unusable value through so validation can refuse it', () => {
    const values: SetupFormValues = { ...defaultFormValues(), timeCapSeconds: 0.5 }
    const config = configFromValues('forTime', values)

    expect(config).toEqual({ mode: 'forTime', timeCapMs: 500 })
    expect(isTimerConfig(config)).toBe(false)
  })

  it('keys the seed on what is being edited, not on the data behind it', () => {
    expect(seedKey('amrap', undefined)).toBe('amrap:')
    expect(seedKey('amrap', 'preset-1')).toBe('amrap:preset-1')
    expect(seedKey('emom', 'preset-1')).not.toBe(seedKey('amrap', 'preset-1'))
    expect(seedKey('amrap', 'preset-2')).not.toBe(seedKey('amrap', 'preset-1'))
  })
})

/**
 * The round trip is the property that matters: a stored preset loaded into the
 * form and read straight back out has to be the same workout. Anything else
 * means opening a preset and pressing Start runs something else — silently,
 * because both values are valid configs.
 *
 * The generator is the config schema, so the bounds come from `converters.ts`
 * rather than from a hand-written arbitrary.
 */
describe('setup form, as a property', () => {
  const anyConfig = Schema.toArbitrary(TimerConfigSchema)

  it.prop('loads a config into the form and reads the same one back', [anyConfig], ([config]) => {
    const values = applyConfigToValues(defaultFormValues(), config as TimerConfig)

    expect(configFromValues((config as TimerConfig).mode, values)).toEqual(config)
  })

  it.prop('survives a second trip through the form', [anyConfig], ([config]) => {
    const once = applyConfigToValues(defaultFormValues(), config as TimerConfig)
    const mode = (config as TimerConfig).mode
    const twice = applyConfigToValues(once, configFromValues(mode, once))

    expect(configFromValues(mode, twice)).toEqual(configFromValues(mode, once))
  })
})
