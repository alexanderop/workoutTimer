<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useReportFailure } from '@/composables/useReportFailure'
import { createPreset, createSession, dbMutation, isPresetDraft, updatePreset } from '@/db'
import { DEFAULT_CONFIGS, isTimerConfig, MINUTE_MS, SECOND_MS } from '@/features/timer/domain'
import { unlockTimerAudio } from '@/features/timer/useTimerFeedback'
import { RouteNames } from '@/router'
import { presetsAtom, sessionsAtom, timerSettingsAtom } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'
import type { PresetDraft, TimerConfig, TimerMode } from '@/types/workout'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const reportFailure = useReportFailure('timer-setup')
const runMutation = useAtomSet(() => dbMutation, { mode: 'promise' })

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

const durationMinutes = ref(10)
const timeCapMinutes = ref<number | undefined>()
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
      durationMinutes.value = config.durationMs / MINUTE_MS
      break
    case 'forTime':
      timeCapMinutes.value =
        config.timeCapMs === undefined ? undefined : config.timeCapMs / MINUTE_MS
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

watch(
  [routeMode, presets],
  ([mode, availablePresets]) => {
    const preset = availablePresets.find((item) => item.id === presetId.value)
    if (preset && preset.config.mode === mode) {
      applyConfig(preset.config)
      workoutNotes.value = preset.workoutNotes
      presetName.value = preset.name
      return
    }
    applyConfig(DEFAULT_CONFIGS[mode])
  },
  { immediate: true },
)

const config = computed<TimerConfig>(() => {
  switch (routeMode.value) {
    case 'amrap':
      return { mode: 'amrap', durationMs: Math.round(durationMinutes.value * MINUTE_MS) }
    case 'forTime':
      return {
        mode: 'forTime',
        ...(timeCapMinutes.value === undefined || timeCapMinutes.value === 0
          ? {}
          : { timeCapMs: Math.round(timeCapMinutes.value * MINUTE_MS) }),
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
  await runMutation(
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
  await runMutation(
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
        <div v-if="routeMode === 'amrap'" class="flex flex-col gap-2">
          <Label for="duration-minutes">{{ t('timer.setup.durationMinutes') }}</Label>
          <input
            id="duration-minutes"
            v-model.number="durationMinutes"
            class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
            type="number"
            min="0.02"
            max="1440"
            step="0.5"
            inputmode="decimal"
          />
        </div>
        <div v-else-if="routeMode === 'forTime'" class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-2 text-sm font-medium" for="time-cap-minutes">
            {{ t('timer.setup.timeCapMinutes') }}
            <input
              id="time-cap-minutes"
              v-model.number="timeCapMinutes"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="0"
              max="1440"
              step="0.5"
              inputmode="decimal"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm font-medium" for="target-rounds">
            {{ t('timer.setup.targetRounds') }}
            <input
              id="target-rounds"
              v-model.number="targetRounds"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="0"
              max="999"
              inputmode="numeric"
            />
          </label>
        </div>
        <div v-else-if="routeMode === 'emom'" class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-2 text-sm font-medium" for="interval-seconds">
            {{ t('timer.setup.intervalSeconds') }}
            <input
              id="interval-seconds"
              v-model.number="intervalSeconds"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="1"
              max="3600"
              inputmode="numeric"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm font-medium" for="emom-rounds">
            {{ t('timer.setup.rounds') }}
            <input
              id="emom-rounds"
              v-model.number="rounds"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="1"
              max="999"
              inputmode="numeric"
            />
          </label>
        </div>
        <div v-else class="grid gap-4 sm:grid-cols-3">
          <label class="flex flex-col gap-2 text-sm font-medium" for="work-seconds">
            {{ t('timer.setup.workSeconds') }}
            <input
              id="work-seconds"
              v-model.number="workSeconds"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="1"
              max="3600"
              inputmode="numeric"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm font-medium" for="rest-seconds">
            {{ t('timer.setup.restSeconds') }}
            <input
              id="rest-seconds"
              v-model.number="restSeconds"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="0"
              max="3600"
              inputmode="numeric"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm font-medium" for="tabata-rounds">
            {{ t('timer.setup.rounds') }}
            <input
              id="tabata-rounds"
              v-model.number="rounds"
              class="h-touch-target rounded-md border bg-transparent px-3 text-lg"
              type="number"
              min="1"
              max="999"
              inputmode="numeric"
            />
          </label>
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
        <input
          id="preset-name"
          v-model="presetName"
          class="h-touch-target rounded-md border bg-transparent px-3"
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
