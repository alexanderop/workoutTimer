import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { TimerMode, TimerPreset } from '@/db'
import { useTimerSetupForm } from '@/features/timer/useTimerSetupForm'

function preset(overrides: Partial<TimerPreset> = {}): TimerPreset {
  return {
    id: 'preset-1',
    name: 'Twenty minute grind',
    config: { mode: 'amrap', durationMs: 1_200_000 },
    workoutNotes: 'Keep moving',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function setup(initialMode: TimerMode = 'amrap', initialPresetId?: string) {
  const mode = ref(initialMode)
  const presetId = ref(initialPresetId)
  const presets = ref<ReadonlyArray<TimerPreset>>([])
  const presetsSettled = ref(initialPresetId === undefined)
  const form = useTimerSetupForm({
    mode,
    presetId,
    presets,
    presetsSettled,
    formatTime: (seconds) => `${seconds}s`,
  })
  return { form, mode, presetId, presets, presetsSettled }
}

describe('useTimerSetupForm', () => {
  it('constructs valid configs from mutable drafts for every timer mode', async () => {
    const { form, mode } = setup()

    form.durationSeconds.value = 127
    expect(form.config.value).toEqual({ mode: 'amrap', durationMs: 127_000 })

    mode.value = 'forTime'
    await nextTick()
    form.timeCapSeconds.value = 600
    form.targetRounds.value = 5
    expect(form.config.value).toEqual({ mode: 'forTime', timeCapMs: 600_000, targetRounds: 5 })

    mode.value = 'emom'
    await nextTick()
    form.intervalSeconds.value = 90
    form.rounds.value = 12
    expect(form.config.value).toEqual({ mode: 'emom', intervalMs: 90_000, rounds: 12 })

    mode.value = 'tabata'
    await nextTick()
    form.workSeconds.value = 30
    form.restSeconds.value = 15
    form.rounds.value = 6
    expect(form.config.value).toEqual({
      mode: 'tabata',
      workMs: 30_000,
      restMs: 15_000,
      rounds: 6,
    })
  })

  it('waits for a named preset, seeds it once, and preserves later edits across refreshes', async () => {
    const { form, presets, presetsSettled } = setup('amrap', 'preset-1')

    presets.value = [preset()]
    await nextTick()
    expect(form.durationSeconds.value).toBe(1_200)
    expect(form.presetName.value).toBe('Twenty minute grind')
    expect(form.workoutNotes.value).toBe('Keep moving')

    form.durationSeconds.value = 1_500
    presets.value = [preset({ updatedAt: 2 })]
    presetsSettled.value = true
    await nextTick()

    expect(form.durationSeconds.value).toBe(1_500)
  })

  it('resets preset-only fields when the route starts a different draft', async () => {
    const { form, mode, presetId, presets } = setup('amrap', 'preset-1')
    presets.value = [preset()]
    await nextTick()

    presetId.value = undefined
    mode.value = 'tabata'
    await nextTick()

    expect(form.config.value).toEqual({
      mode: 'tabata',
      workMs: 20_000,
      restMs: 10_000,
      rounds: 8,
    })
    expect(form.presetName.value).toBe('')
    expect(form.workoutNotes.value).toBe('')
  })

  it('keeps selected custom values in the picker options', () => {
    const { form } = setup()
    form.durationSeconds.value = 127

    expect(form.durationOptions.value).toContainEqual({ value: 127, label: '127s' })
  })
})
