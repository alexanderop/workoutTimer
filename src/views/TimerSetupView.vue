<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed, ref } from 'vue'
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
  presetMutation,
  updatePreset,
  workoutStartMutation,
} from '@/db'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { MAX_TIMER_DURATION_SECONDS, useTimerSetupForm } from '@/features/timer/useTimerSetupForm'
import { unlockTimerAudio } from '@/features/timer/useTimerFeedback'
import { RouteNames } from '@/router'
import { presetsAtom, sessionsAtom, timerSettingsAtom } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'
import type { TimerMode } from '@/db'

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

const isStarting = ref(false)
const isSavingPreset = ref(false)
const presetsSettled = computed(() => !AsyncResult.isWaiting(presetsResult.value))

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

const {
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
} = useTimerSetupForm({
  mode: routeMode,
  presetId,
  presets,
  presetsSettled,
  formatTime,
})

const canStart = computed(() => isValidConfig.value && !isStarting.value && !hasActiveSession.value)
const canSavePreset = computed(() => isValidPreset.value && !isSavingPreset.value)

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
            :max-seconds="MAX_TIMER_DURATION_SECONDS"
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
            :max-seconds="MAX_TIMER_DURATION_SECONDS"
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
      <p v-else-if="!isValidConfig" role="alert" class="text-sm text-destructive">
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
