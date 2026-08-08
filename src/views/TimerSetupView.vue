<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useReportFailure } from '@/composables/useReportFailure'
import {
  createPreset,
  createSession,
  isPresetDraft,
  presetMutation,
  updatePreset,
  workoutStartMutation,
} from '@/db'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { DEFAULT_CONFIGS, isTimerConfig, SECOND_MS } from '@/features/timer/domain'
import {
  countValues,
  includeSelectedValue,
  timerDurationValues,
  type PickerOption,
} from '@/features/timer/pickerOptions'
import { unlockTimerAudio } from '@/features/timer/useTimerFeedback'
import { RouteNames } from '@/router'
import { presetsAtom, sessionsAtom, timerSettingsAtom } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'
import type { PresetDraft, TimerConfig, TimerMode } from '@/db'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const reportFailure = useReportFailure('timer-setup')
const runStartMutation = useAtomSet(() => workoutStartMutation, { mode: 'promise' })
const runPresetMutation = useAtomSet(() => presetMutation, { mode: 'promise' })

const routeMode = computed<TimerMode>(() => {
  const value = String(route.params.mode)
  return ['amrap', 'forTime', 'emom', 'tabata'].includes(value) ? (value as TimerMode) : 'amrap'
})
const presetId = computed(() =>
  typeof route.query.preset === 'string' ? route.query.preset : undefined,
)

const sessionsResult = useAtomValue(() => sessionsAtom)
const presetsResult = useAtomValue(() => presetsAtom)
const settingsResult = useAtomValue(() => timerSettingsAtom)
const sessions = computed(() => AsyncResult.getOrElse(sessionsResult.value, () => []))
const presets = computed(() => AsyncResult.getOrElse(presetsResult.value, () => []))
const settings = computed(() => AsyncResult.getOrElse(settingsResult.value, () => undefined))
const hasActiveSession = computed(() =>
  sessions.value.some((session) => ['countdown', 'running', 'paused'].includes(session.status)),
)

const MAX_DURATION_SECONDS = 24 * 60 * 60
const DURATION_VALUES = timerDurationValues(MAX_DURATION_SECONDS, 15)
const INTERVAL_VALUES = timerDurationValues(60 * 60)
const ROUND_VALUES = countValues(20)

const durationSeconds = ref(10 * 60)
const timeCapSeconds = ref<number | undefined>()
const targetRounds = ref<number | undefined>()
const intervalSeconds = ref(60)
const rounds = ref(10)
const workSeconds = ref(20)
const restSeconds = ref(10)
const workoutNotes = ref('')
const presetName = ref('')
const isStarting = ref(false)
const isSavingPreset = ref(false)

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
 * Seeds the form once per thing-being-edited, and never again.
 *
 * The subtlety is that `presets` is a *reloading* source: any write to the
 * presets table hands this watcher a brand-new array, and re-seeding on that
 * would throw away everything the user has typed since. That is not
 * hypothetical — saving a preset is itself such a write, so configuring a
 * 20-minute AMRAP and pressing "Save as preset" used to snap the form back to
 * the mode default, leaving a Start button that would run a workout the user
 * never asked for.
 *
 * So the trigger is the *identity* of what we are editing (`mode:presetId`),
 * not the data behind it. Seeding is deferred while a named preset is still
 * loading, because arriving rows must still be allowed to fill the form in.
 */
const presetsSettled = computed(() => !AsyncResult.isWaiting(presetsResult.value))
let seededFor: string | undefined

watch(
  [routeMode, presetId, presets, presetsSettled],
  ([mode, id, availablePresets, settled]) => {
    const key = `${mode}:${id ?? ''}`
    if (seededFor === key) return

    const preset = availablePresets.find((item) => item.id === id)
    if (preset && preset.config.mode === mode) {
      applyConfig(preset.config)
      workoutNotes.value = preset.workoutNotes
      presetName.value = preset.name
      seededFor = key
      return
    }

    applyConfig(DEFAULT_CONFIGS[mode])
    // A named preset that has not arrived yet may still turn up; a preset that
    // is absent from settled data (or was never named) is the final answer.
    if (id === undefined || settled) seededFor = key
  },
  { immediate: true },
)

const config = computed<TimerConfig>(() => {
  switch (routeMode.value) {
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

function formatTime(seconds: number): string {
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

function timeOptions(
  values: ReadonlyArray<number>,
  selected: number | undefined,
): Array<PickerOption> {
  return includeSelectedValue(values, selected).map((value) => ({
    value,
    label: formatTime(value),
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

const canStart = computed(
  () => isTimerConfig(config.value) && !isStarting.value && !hasActiveSession.value,
)
const presetDraft = computed<PresetDraft>(() => ({
  name: presetName.value,
  config: config.value,
  workoutNotes: workoutNotes.value,
}))
const canSavePreset = computed(
  () => isTimerConfig(config.value) && isPresetDraft(presetDraft.value) && !isSavingPreset.value,
)

function modeName(): string {
  switch (routeMode.value) {
    case 'amrap':
      return t('timer.modes.amrap.name')
    case 'forTime':
      return t('timer.modes.forTime.name')
    case 'emom':
      return t('timer.modes.emom.name')
    case 'tabata':
      return t('timer.modes.tabata.name')
  }
}

async function start(): Promise<void> {
  if (!canStart.value) return
  isStarting.value = true
  unlockTimerAudio()
  const failed = reportFailure('start workout', t('timer.setup.startFailed'))
  await runStartMutation(
    createSession({
      config: config.value,
      ...(presetId.value === undefined ? {} : { presetId: presetId.value }),
      workoutNotes: workoutNotes.value,
      countdownDurationMs: settings.value?.startCountdownMs ?? 3_000,
    }).pipe(
      Effect.tap((session) =>
        Effect.sync(() => {
          void router.push({ name: RouteNames.timerRun, params: { id: session.id } })
        }),
      ),
      Effect.catchTags({
        'Db.DatabaseError': failed,
        'Db.WorkoutInvalidError': failed,
      }),
      Effect.ensuring(
        Effect.sync(() => {
          isStarting.value = false
        }),
      ),
    ),
  )
}

async function savePreset(): Promise<void> {
  if (!canSavePreset.value) return
  isSavingPreset.value = true
  const failed = reportFailure('save preset', t('timer.setup.saveFailed'))
  const program = presetId.value
    ? updatePreset(presetId.value, presetDraft.value)
    : createPreset(presetDraft.value)
  await runPresetMutation(
    program.pipe(
      Effect.tap(() => Effect.sync(() => toast.showToast(t('timer.setup.saveSuccess')))),
      Effect.catchTags({
        'Db.DatabaseError': failed,
        'Db.WorkoutInvalidError': failed,
      }),
      Effect.ensuring(
        Effect.sync(() => {
          isSavingPreset.value = false
        }),
      ),
    ),
  )
}
</script>

<template>
  <PageLayout
    :title="t('timer.setup.title', { mode: modeName() })"
    back-to="/"
    :data-mode="routeMode"
  >
    <form class="mx-auto flex w-full max-w-lg flex-col gap-section p-4" @submit.prevent="start">
      <section class="rounded-2xl border bg-card p-4 shadow-xs">
        <div v-if="routeMode === 'amrap'">
          <TimePicker
            id="duration"
            v-model="durationSeconds"
            :label="t('timer.setup.duration')"
            :options="durationOptions"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="1"
            :max-seconds="MAX_DURATION_SECONDS"
          />
        </div>
        <div v-else-if="routeMode === 'forTime'" class="grid gap-4 sm:grid-cols-2">
          <TimePicker
            id="time-cap"
            v-model="timeCapSeconds"
            :label="t('timer.setup.timeCap')"
            :options="timeCapOptions"
            :empty-label="t('timer.setup.noTimeCap')"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="1"
            :max-seconds="MAX_DURATION_SECONDS"
          />
          <ValuePicker
            id="target-rounds"
            v-model="targetRounds"
            :label="t('timer.setup.targetRounds')"
            :options="targetRoundOptions"
            :empty-label="t('timer.setup.noTargetRounds')"
            :custom-label="t('timer.setup.customRounds')"
          />
        </div>
        <div v-else-if="routeMode === 'emom'" class="grid gap-4 sm:grid-cols-2">
          <TimePicker
            id="interval"
            v-model="intervalSeconds"
            :label="t('timer.setup.interval')"
            :options="intervalOptions"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="5"
            :max-seconds="3600"
          />
          <ValuePicker
            id="emom-rounds"
            v-model="rounds"
            :label="t('timer.setup.rounds')"
            :options="roundPickerOptions"
            :custom-label="t('timer.setup.customRounds')"
          />
        </div>
        <div v-else class="grid gap-4 sm:grid-cols-3">
          <TimePicker
            id="work"
            v-model="workSeconds"
            :label="t('timer.setup.work')"
            :options="workOptions"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="1"
            :max-seconds="3600"
          />
          <TimePicker
            id="rest"
            v-model="restSeconds"
            :label="t('timer.setup.rest')"
            :options="restOptions"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="0"
            :max-seconds="3600"
          />
          <ValuePicker
            id="tabata-rounds"
            v-model="rounds"
            :label="t('timer.setup.rounds')"
            :options="roundPickerOptions"
            :custom-label="t('timer.setup.customRounds')"
          />
        </div>
      </section>

      <div class="flex flex-col gap-2">
        <Label for="workout-notes">{{ t('timer.setup.workoutNotes') }}</Label>
        <Textarea
          id="workout-notes"
          v-model="workoutNotes"
          :placeholder="t('timer.setup.workoutNotesPlaceholder')"
        />
      </div>

      <section class="flex flex-col gap-3 rounded-2xl border p-4">
        <Label for="preset-name">{{ t('timer.setup.presetName') }}</Label>
        <Input
          id="preset-name"
          v-model="presetName"
          maxlength="80"
          :placeholder="t('timer.setup.presetNamePlaceholder')"
        />
        <Button type="button" variant="outline" :disabled="!canSavePreset" @click="savePreset">
          {{ presetId ? t('timer.setup.updatePreset') : t('timer.setup.savePreset') }}
        </Button>
      </section>

      <p v-if="hasActiveSession" role="alert" class="text-sm text-destructive">
        {{ t('timer.setup.activeExists') }}
      </p>
      <p v-else-if="!isTimerConfig(config)" role="alert" class="text-sm text-destructive">
        {{ t('timer.setup.invalid') }}
      </p>
    </form>

    <template #footer>
      <div :data-mode="routeMode" class="mx-auto w-full max-w-lg p-4 safe-area-bottom">
        <Button
          class="h-14 w-full bg-[var(--mode-color)] text-base text-[var(--mode-foreground)]"
          :disabled="!canStart"
          @click="start"
        >
          {{ t('common.buttons.start') }}
        </Button>
      </div>
    </template>
  </PageLayout>
</template>
