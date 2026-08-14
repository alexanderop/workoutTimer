import { AtomRegistry } from '@effect/atom-vue'
import { describe, expect, it } from 'vitest'
import {
  durationOptions,
  roundOptions,
  setupConfigAtom,
  setupDraftAtom,
  setupKey,
  toTimerConfig,
  type TimerSetupDraft,
} from '@/features/timer/setupForm'
import type { TimerMode } from '@/db'

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
