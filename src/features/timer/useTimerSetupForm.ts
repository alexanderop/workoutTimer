import { computed, ref, watch, type Ref } from 'vue'
import type { PresetDraft, TimerConfig, TimerMode, TimerPreset } from '@/db'
import { isPresetDraft } from '@/db'
import { DEFAULT_CONFIGS, isTimerConfig, SECOND_MS } from '@/features/timer/domain'
import {
  countValues,
  includeSelectedValue,
  timerDurationValues,
  type PickerOption,
} from '@/features/timer/pickerOptions'

export const MAX_TIMER_DURATION_SECONDS = 24 * 60 * 60
const DURATION_VALUES = timerDurationValues(MAX_TIMER_DURATION_SECONDS, 15)
const INTERVAL_VALUES = timerDurationValues(60 * 60)
const ROUND_VALUES = countValues(20)

interface TimerSetupFormOptions {
  readonly mode: Readonly<Ref<TimerMode>>
  readonly presetId: Readonly<Ref<string | undefined>>
  readonly presets: Readonly<Ref<ReadonlyArray<TimerPreset>>>
  readonly presetsSettled: Readonly<Ref<boolean>>
  readonly formatTime: (seconds: number) => string
}

/**
 * Owns the timer setup form's state machine.
 *
 * The route decides which mode/preset is being edited and the view owns I/O.
 * This feature boundary owns the mutable draft, preset seeding policy, config
 * construction, and picker derivation so those rules can be tested without a
 * browser or a database.
 */
export function useTimerSetupForm(options: TimerSetupFormOptions) {
  const durationSeconds = ref(10 * 60)
  const timeCapSeconds = ref<number | undefined>()
  const targetRounds = ref<number | undefined>()
  const intervalSeconds = ref(60)
  const rounds = ref(10)
  const workSeconds = ref(20)
  const restSeconds = ref(10)
  const workoutNotes = ref('')
  const presetName = ref('')

  function applyConfig(config: TimerConfig): void {
    switch (config.mode) {
      case 'amrap':
        durationSeconds.value = config.durationMs / SECOND_MS
        break
      case 'forTime':
        timeCapSeconds.value =
          config.timeCapMs === undefined ? undefined : config.timeCapMs / SECOND_MS
        targetRounds.value = config.targetRounds
        break
      case 'emom':
        intervalSeconds.value = config.intervalMs / SECOND_MS
        rounds.value = config.rounds
        break
      case 'tabata':
        workSeconds.value = config.workMs / SECOND_MS
        restSeconds.value = config.restMs / SECOND_MS
        rounds.value = config.rounds
        break
    }
  }

  /**
   * Seed once per thing-being-edited, not once per presets-array identity.
   * Preset mutations refresh that array; re-seeding after a save would discard
   * the user's draft. A named preset is allowed to arrive asynchronously.
   */
  let seededFor: string | undefined
  watch(
    [options.mode, options.presetId, options.presets, options.presetsSettled],
    ([mode, presetId, presets, presetsSettled]) => {
      const key = `${mode}:${presetId ?? ''}`
      if (seededFor === key) return

      const preset = presets.find((item) => item.id === presetId)
      if (preset?.config.mode === mode) {
        applyConfig(preset.config)
        workoutNotes.value = preset.workoutNotes
        presetName.value = preset.name
        seededFor = key
        return
      }

      applyConfig(DEFAULT_CONFIGS[mode])
      workoutNotes.value = ''
      presetName.value = ''
      if (presetId === undefined || presetsSettled) seededFor = key
    },
    { immediate: true },
  )

  const config = computed<TimerConfig>(() => {
    switch (options.mode.value) {
      case 'amrap':
        return { mode: 'amrap', durationMs: Math.round(durationSeconds.value * SECOND_MS) }
      case 'forTime':
        return {
          mode: 'forTime',
          ...(timeCapSeconds.value === undefined || timeCapSeconds.value === 0
            ? {}
            : { timeCapMs: Math.round(timeCapSeconds.value * SECOND_MS) }),
          ...(targetRounds.value === undefined || targetRounds.value === 0
            ? {}
            : { targetRounds: Math.round(targetRounds.value) }),
        }
      case 'emom':
        return {
          mode: 'emom',
          intervalMs: Math.round(intervalSeconds.value * SECOND_MS),
          rounds: Math.round(rounds.value),
        }
      case 'tabata':
        return {
          mode: 'tabata',
          workMs: Math.round(workSeconds.value * SECOND_MS),
          restMs: Math.round(restSeconds.value * SECOND_MS),
          rounds: Math.round(rounds.value),
        }
    }
  })

  function timeOptions(
    values: ReadonlyArray<number>,
    selected: number | undefined,
  ): Array<PickerOption> {
    return includeSelectedValue(values, selected).map((value) => ({
      value,
      label: options.formatTime(value),
    }))
  }

  function roundOptions(selected: number | undefined): Array<PickerOption> {
    return includeSelectedValue(ROUND_VALUES, selected).map((value) => ({
      value,
      label: String(value),
    }))
  }

  const durationOptions = computed(() => timeOptions(DURATION_VALUES, durationSeconds.value))
  const timeCapOptions = computed(() => timeOptions(DURATION_VALUES, timeCapSeconds.value))
  const targetRoundOptions = computed(() => roundOptions(targetRounds.value))
  const intervalOptions = computed(() => timeOptions(INTERVAL_VALUES, intervalSeconds.value))
  const roundPickerOptions = computed(() => roundOptions(rounds.value))
  const workOptions = computed(() => timeOptions(INTERVAL_VALUES, workSeconds.value))
  const restOptions = computed(() => timeOptions([0, ...INTERVAL_VALUES], restSeconds.value))
  const isValidConfig = computed(() => isTimerConfig(config.value))
  const presetDraft = computed<PresetDraft>(() => ({
    name: presetName.value,
    config: config.value,
    workoutNotes: workoutNotes.value,
  }))
  const isValidPreset = computed(() => isValidConfig.value && isPresetDraft(presetDraft.value))

  return {
    config,
    durationOptions,
    durationSeconds,
    intervalOptions,
    intervalSeconds,
    isValidConfig,
    isValidPreset,
    presetDraft,
    presetName,
    restOptions,
    restSeconds,
    roundPickerOptions,
    rounds,
    targetRoundOptions,
    targetRounds,
    timeCapOptions,
    timeCapSeconds,
    workOptions,
    workSeconds,
    workoutNotes,
  }
}
