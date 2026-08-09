<script setup lang="ts">
import { useAtomSet } from '@effect/atom-vue'
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
  isPresetDraft,
  presetMutation,
  updatePreset,
  workoutStartMutation,
} from '@/db'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { isActiveSession, isTimerConfig, parseTimerMode } from '@/features/timer/domain'
import { MAX_DURATION_SECONDS } from '@/features/timer/setupForm'
import { unlockTimerAudio } from '@/features/timer/useTimerFeedback'
import { useTimerLabels } from '@/features/timer/useTimerLabels'
import { useTimerSetupForm } from '@/features/timer/useTimerSetupForm'
import { RouteNames } from '@/router'
import { usePresets, useSessions, useTimerSettings } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'
import type { PresetDraft, TimerMode } from '@/db'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const reportFailure = useReportFailure('timer-setup')
const { modeName } = useTimerLabels()
const runStartMutation = useAtomSet(() => workoutStartMutation, { mode: 'promise' })
const runPresetMutation = useAtomSet(() => presetMutation, { mode: 'promise' })

const routeMode = computed<TimerMode>(() => parseTimerMode(route.params.mode) ?? 'amrap')
const presetId = computed(() =>
  typeof route.query.preset === 'string' ? route.query.preset : undefined,
)

const { data: sessions } = useSessions()
const { data: presets, settled: presetsSettled } = usePresets()
const { data: settings } = useTimerSettings()
const hasActiveSession = computed(() =>
  sessions.value.some((session) => isActiveSession(session.status)),
)

const { values, workoutNotes, presetName, config, pickers } = useTimerSetupForm({
  mode: routeMode,
  presetId,
  presets,
  presetsSettled,
})

const isStarting = ref(false)
const isSavingPreset = ref(false)

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
      countdownDurationMs: settings.value.startCountdownMs,
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
    :title="t('timer.setup.title', { mode: modeName(routeMode) })"
    back-to="/"
    :data-mode="routeMode"
  >
    <form class="mx-auto flex w-full max-w-lg flex-col gap-section p-4" @submit.prevent="start">
      <section class="rounded-2xl border bg-card p-4 shadow-xs">
        <div v-if="routeMode === 'amrap'">
          <TimePicker
            id="duration"
            v-model="values.durationSeconds"
            :label="t('timer.setup.duration')"
            :options="pickers.duration"
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
            v-model="values.timeCapSeconds"
            :label="t('timer.setup.timeCap')"
            :options="pickers.timeCap"
            :empty-label="t('timer.setup.noTimeCap')"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="1"
            :max-seconds="MAX_DURATION_SECONDS"
          />
          <ValuePicker
            id="target-rounds"
            v-model="values.targetRounds"
            :label="t('timer.setup.targetRounds')"
            :options="pickers.targetRounds"
            :empty-label="t('timer.setup.noTargetRounds')"
            :custom-label="t('timer.setup.customRounds')"
          />
        </div>
        <div v-else-if="routeMode === 'emom'" class="grid gap-4 sm:grid-cols-2">
          <TimePicker
            id="interval"
            v-model="values.intervalSeconds"
            :label="t('timer.setup.interval')"
            :options="pickers.interval"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="5"
            :max-seconds="3600"
          />
          <ValuePicker
            id="emom-rounds"
            v-model="values.rounds"
            :label="t('timer.setup.rounds')"
            :options="pickers.rounds"
            :custom-label="t('timer.setup.customRounds')"
          />
        </div>
        <div v-else class="grid gap-4 sm:grid-cols-3">
          <TimePicker
            id="work"
            v-model="values.workSeconds"
            :label="t('timer.setup.work')"
            :options="pickers.work"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="1"
            :max-seconds="3600"
          />
          <TimePicker
            id="rest"
            v-model="values.restSeconds"
            :label="t('timer.setup.rest')"
            :options="pickers.rest"
            :custom-label="t('timer.setup.customTime')"
            :minutes-label="t('timer.setup.minutes')"
            :seconds-label="t('timer.setup.seconds')"
            :min-seconds="0"
            :max-seconds="3600"
          />
          <ValuePicker
            id="tabata-rounds"
            v-model="values.rounds"
            :label="t('timer.setup.rounds')"
            :options="pickers.rounds"
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
