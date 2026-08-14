import { AtomRegistry } from '@effect/atom-vue'
import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { DEFAULT_CONFIGS, isTimerConfig, TIMER_MODES } from '@/features/timer/domain'
import {
  applyConfigToDraft,
  BASE_DRAFT,
  durationOptions,
  roundOptions,
  setupConfigAtom,
  setupDraftAtom,
  setupKey,
  toTimerConfig,
  type TimerSetupDraft,
} from '@/features/timer/setupForm'
import { TimerConfigSchema } from '@/db/converters'
import type { TimerConfig, TimerMode } from '@/db'

/**
 * The setup form used to be nine `ref`s and a seeding `watch` inside a
 * composable, which meant every test of it needed a Vue effect scope and four
 * refs of scaffolding to stand in for the route and the presets table. Now it
 * is a draft *value* per `mode:presetId`, so the same rules are checked by
 * reading and writing one atom in a bare registry.
 *
 * The preset-seeding half of the rules is not here: seeding reads the presets
 * table, and this tier has no IndexedDB. `src/__tests__/components/` covers it
 * against the real database.
 */
function draftFor(mode: TimerMode) {
  const registry = AtomRegistry.make()
  const key = setupKey({ mode, presetId: undefined })
  const atom = setupDraftAtom(key)

  return {
    read: (): TimerSetupDraft => registry.get(atom),
    edit: (patch: Partial<TimerSetupDraft>): void =>
      registry.set(atom, { ...registry.get(atom), ...patch }),
    config: () => registry.get(setupConfigAtom(key)),
  }
}

describe('setupDraftAtom', () => {
  it('starts each mode from that mode’s defaults', () => {
    expect(draftFor('amrap').config()).toEqual({ mode: 'amrap', durationMs: 600_000 })
    expect(draftFor('tabata').config()).toEqual({
      mode: 'tabata',
      workMs: 20_000,
      restMs: 10_000,
      rounds: 8,
    })
  })

  it('keeps drafts for different modes apart', () => {
    const amrap = draftFor('amrap')
    const emom = draftFor('emom')

    amrap.edit({ durationSeconds: 127 })

    expect(amrap.config()).toEqual({ mode: 'amrap', durationMs: 127_000 })
    expect(emom.read().durationSeconds).not.toBe(127)
  })

  it('rebuilds the config from every edit', () => {
    const form = draftFor('emom')

    form.edit({ intervalSeconds: 90, rounds: 12 })

    expect(form.config()).toEqual({ mode: 'emom', intervalMs: 90_000, rounds: 12 })
  })

  it('keys the draft on what is being edited, not on the data behind it', () => {
    expect(setupKey({ mode: 'amrap', presetId: undefined })).toBe('amrap:')
    expect(setupKey({ mode: 'amrap', presetId: 'preset-1' })).toBe('amrap:preset-1')
    expect(setupKey({ mode: 'emom', presetId: 'preset-1' })).not.toBe(
      setupKey({ mode: 'amrap', presetId: 'preset-1' }),
    )
    expect(setupKey({ mode: 'amrap', presetId: 'preset-2' })).not.toBe(
      setupKey({ mode: 'amrap', presetId: 'preset-1' }),
    )
  })
})

describe('the draft as a flat set of fields', () => {
  /** What the screen does on arrival: start from the defaults, seed the mode shown. */
  it('seeds a mode from its default and reads that default back', () => {
    for (const mode of TIMER_MODES) {
      const seeded = applyConfigToDraft(BASE_DRAFT, DEFAULT_CONFIGS[mode])

      expect(toTimerConfig(mode, seeded)).toEqual(DEFAULT_CONFIGS[mode])
    }
  })

  /**
   * EMOM and Tabata bind the same `rounds` field, which is why switching
   * between them keeps the count rather than resetting it — and why
   * `BASE_DRAFT` cannot hold both modes' default at once. It does not have to:
   * the draft for a mode seeds that mode last.
   */
  it('shares the round count between EMOM and Tabata', () => {
    const draft = applyConfigToDraft(BASE_DRAFT, {
      mode: 'emom',
      intervalMs: 60_000,
      rounds: 15,
    })
    const asTabata = toTimerConfig('tabata', draft)

    expect(asTabata.mode === 'tabata' && asTabata.rounds).toBe(15)
    expect(BASE_DRAFT.durationSeconds).toBe(600)
    expect(BASE_DRAFT.intervalSeconds).toBe(60)
  })

  it('produces a config the repository would accept, for every mode', () => {
    for (const mode of TIMER_MODES) {
      expect(isTimerConfig(toTimerConfig(mode, BASE_DRAFT))).toBe(true)
    }
  })

  /**
   * Switching mode must not disturb what was configured for the other one:
   * the fields are shared, and applying a config patches only the fields that
   * config has an opinion about.
   */
  it('leaves the other modes alone when a config is applied', () => {
    const after = applyConfigToDraft(BASE_DRAFT, { mode: 'amrap', durationMs: 1_800_000 })

    expect(after.durationSeconds).toBe(1_800)
    expect(toTimerConfig('tabata', after)).toEqual(toTimerConfig('tabata', BASE_DRAFT))
    expect(toTimerConfig('forTime', after)).toEqual(toTimerConfig('forTime', BASE_DRAFT))
  })

  it('does not mutate the draft it is given', () => {
    const snapshot = { ...BASE_DRAFT }

    applyConfigToDraft(BASE_DRAFT, { mode: 'amrap', durationMs: 1_000 })

    expect(BASE_DRAFT).toEqual(snapshot)
  })
})

describe('toTimerConfig', () => {
  const base: TimerSetupDraft = {
    durationSeconds: 127,
    timeCapSeconds: 600,
    targetRounds: 5,
    intervalSeconds: 90,
    rounds: 12,
    workSeconds: 30,
    restSeconds: 15,
    workoutNotes: '',
    presetName: '',
  }

  it('builds a config for every mode from one draft', () => {
    expect(toTimerConfig('amrap', base)).toEqual({ mode: 'amrap', durationMs: 127_000 })
    expect(toTimerConfig('forTime', base)).toEqual({
      mode: 'forTime',
      timeCapMs: 600_000,
      targetRounds: 5,
    })
    expect(toTimerConfig('emom', base)).toEqual({ mode: 'emom', intervalMs: 90_000, rounds: 12 })
    expect(toTimerConfig('tabata', base)).toEqual({
      mode: 'tabata',
      workMs: 30_000,
      restMs: 15_000,
      rounds: 12,
    })
  })

  // An empty time cap is "no cap", not "a cap of zero" — the key has to be
  // absent, because the schema treats a present `timeCapMs` as a real limit.
  it('omits an unset time cap and target round count', () => {
    expect(
      toTimerConfig('forTime', { ...base, timeCapSeconds: undefined, targetRounds: 0 }),
    ).toEqual({ mode: 'forTime' })
  })

  /**
   * The counterpart: a value that is neither absent nor usable has to reach
   * the config, so `isTimerConfig` disables Start and says so — rather than
   * being read as "no cap" and quietly starting an uncapped workout.
   */
  it('passes an unusable value through so validation can refuse it', () => {
    const config = toTimerConfig('forTime', {
      ...BASE_DRAFT,
      timeCapSeconds: 0.5,
      targetRounds: undefined,
    })

    expect(config).toEqual({ mode: 'forTime', timeCapMs: 500 })
    expect(isTimerConfig(config)).toBe(false)
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
describe('the draft, as a property', () => {
  const anyConfig = Schema.toArbitrary(TimerConfigSchema)

  it.prop('loads a config into the draft and reads the same one back', [anyConfig], ([config]) => {
    const draft = applyConfigToDraft(BASE_DRAFT, config as TimerConfig)

    expect(toTimerConfig((config as TimerConfig).mode, draft)).toEqual(config)
  })

  it.prop('survives a second trip through the draft', [anyConfig], ([config]) => {
    const once = applyConfigToDraft(BASE_DRAFT, config as TimerConfig)
    const mode = (config as TimerConfig).mode
    const twice = applyConfigToDraft(once, toTimerConfig(mode, once))

    expect(toTimerConfig(mode, twice)).toEqual(toTimerConfig(mode, once))
  })
})

describe('picker options', () => {
  it('keeps a custom value in the list so it stays selectable', () => {
    expect(durationOptions(127, (seconds) => `${seconds}s`)).toContainEqual({
      value: 127,
      label: '127s',
    })
    expect(roundOptions(37)).toContainEqual({ value: 37, label: '37' })
  })
})
