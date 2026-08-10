import { computed, reactive, ref, toValue, watch, type ComputedRef, type Ref } from 'vue'
import { DEFAULT_CONFIGS } from './domain'
import { countValues, pickerOptions, timerDurationValues, type PickerOption } from './pickerOptions'
import {
  applyConfigToValues,
  configFromValues,
  defaultFormValues,
  MAX_DURATION_SECONDS,
  seedKey,
  type SetupFormValues,
} from './setupForm'
import { useTimerLabels } from './useTimerLabels'
import type { MaybeRefOrGetter } from 'vue'
import type { TimerConfig, TimerMode, TimerPreset } from '@/db'

/**
 * What the form is editing, handed in rather than read from a store: the
 * feature stays independent of where presets come from, the same way
 * `useTimerFeedback` takes settings instead of fetching them.
 */
export interface SetupFormSource {
  readonly mode: MaybeRefOrGetter<TimerMode>
  readonly presetId: MaybeRefOrGetter<string | undefined>
  readonly presets: MaybeRefOrGetter<ReadonlyArray<TimerPreset>>
  /** False while presets are still loading — see the seeding rule below. */
  readonly presetsSettled: MaybeRefOrGetter<boolean>
}

/**
 * One list per picker on the screen, each already showing its current value.
 * Reactive rather than a bag of refs, so the template reads `pickers.duration`.
 */
interface SetupPickers {
  readonly duration: Array<PickerOption>
  readonly timeCap: Array<PickerOption>
  readonly targetRounds: Array<PickerOption>
  readonly interval: Array<PickerOption>
  readonly rounds: Array<PickerOption>
  readonly work: Array<PickerOption>
  readonly rest: Array<PickerOption>
}

export interface TimerSetupForm {
  /** The picker-bound fields, in seconds. Mutable: `v-model="values.rounds"`. */
  readonly values: SetupFormValues
  readonly workoutNotes: Ref<string>
  readonly presetName: Ref<string>
  /** The fields read back as the config for the current mode. */
  readonly config: ComputedRef<TimerConfig>
  readonly pickers: SetupPickers
}

const DURATION_VALUES = timerDurationValues(MAX_DURATION_SECONDS, 15)
const INTERVAL_VALUES = timerDurationValues(60 * 60)
/** Rest is the one duration that may legitimately be none: an EMOM-style Tabata. */
const REST_VALUES = [0, ...INTERVAL_VALUES]
const ROUND_VALUES = countValues(20)

/**
 * The setup screen's form: the fields, and the rule for filling them in.
 *
 * **Seeding happens once per thing-being-edited, and never again.** The
 * subtlety is that presets are a *reloading* source: any write to the presets
 * table hands the watcher a brand-new array, and re-seeding on that would
 * throw away everything the user has typed since. That is not hypothetical —
 * saving a preset is itself such a write, so configuring a 20-minute AMRAP and
 * pressing "Save as preset" used to snap the form back to the mode default,
 * leaving a Start button that would run a workout the user never asked for.
 *
 * So the trigger is the *identity* of what is being edited (`seedKey`), not
 * the data behind it. Seeding is deferred while a named preset is still
 * loading, because arriving rows must still be allowed to fill the form in.
 */
export function useTimerSetupForm(source: SetupFormSource): TimerSetupForm {
  const values = reactive<SetupFormValues>(defaultFormValues())
  const workoutNotes = ref('')
  const presetName = ref('')

  const seed = (config: TimerConfig): void => {
    Object.assign(values, applyConfigToValues(values, config))
  }

  let seededFor: string | undefined

  watch(
    [
      () => toValue(source.mode),
      () => toValue(source.presetId),
      () => toValue(source.presets),
      () => toValue(source.presetsSettled),
    ],
    ([mode, presetId, presets, settled]) => {
      const key = seedKey(mode, presetId)
      if (seededFor === key) return

      const preset = presets.find((item) => item.id === presetId)
      if (preset && preset.config.mode === mode) {
        seed(preset.config)
        workoutNotes.value = preset.workoutNotes
        presetName.value = preset.name
        seededFor = key
        return
      }

      seed(DEFAULT_CONFIGS[mode])
      // A named preset that has not arrived yet may still turn up; a preset
      // that is absent from settled data (or was never named) is the final
      // answer.
      if (presetId === undefined || settled) seededFor = key
    },
    { immediate: true },
  )

  // Each list folds in the value the picker is *currently* showing, so the
  // selected value has to be read inside the computed rather than captured.
  const { humanizeSeconds } = useTimerLabels()
  const time = (offered: ReadonlyArray<number>, selected: () => number | undefined) =>
    computed(() => pickerOptions(offered, selected(), humanizeSeconds))
  const count = (selected: () => number | undefined) =>
    computed(() => pickerOptions(ROUND_VALUES, selected(), String))

  return {
    values,
    workoutNotes,
    presetName,
    config: computed(() => configFromValues(toValue(source.mode), values)),
    pickers: reactive({
      duration: time(DURATION_VALUES, () => values.durationSeconds),
      timeCap: time(DURATION_VALUES, () => values.timeCapSeconds),
      targetRounds: count(() => values.targetRounds),
      interval: time(INTERVAL_VALUES, () => values.intervalSeconds),
      rounds: count(() => values.rounds),
      work: time(INTERVAL_VALUES, () => values.workSeconds),
      rest: time(REST_VALUES, () => values.restSeconds),
    }),
  }
}
