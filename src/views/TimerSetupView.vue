<script setup lang="ts">
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createPreset,
  createSession,
  presetMutation,
  updatePreset,
  workoutStartMutation,
} from '@/db'
import { hasActiveSessionAtom } from '@/features/timer/atoms'
import { MODE_FIELDS } from '@/features/timer/components/fields'
import {
  setupConfigAtom,
  setupDraftAtom,
  setupKeyAtom,
  setupModeAtom,
  setupPresetDraftAtom,
  setupPresetIdAtom,
  setupValidConfigAtom,
  setupValidPresetAtom,
  type TimerSetupDraft,
} from '@/features/timer/setupForm'
import { modeName } from '@/features/timer/labels'
import { unlockTimerAudio } from '@/features/timer/timerFeedback'
import { failureReporter } from '@/lib/reportFailure'
import { RouteNames } from '@/router'
import { pendingAtom } from '@/state/pending'
import { timerSettingsValueAtom } from '@/state/timerData'
import { showToastAtom } from '@/state/toast'

const { t } = useI18n()
const router = useRouter()
const showToast = useAtomSet(() => showToastAtom)
const reportFailure = failureReporter('timer-setup', showToast)
const runStartMutation = useAtomSet(() => workoutStartMutation, { mode: 'promise' })
const runPresetMutation = useAtomSet(() => presetMutation, { mode: 'promise' })

const routeMode = useAtomValue(() => setupModeAtom)
const presetId = useAtomValue(() => setupPresetIdAtom)
const setupKey = useAtomValue(() => setupKeyAtom)

const settings = useAtomValue(() => timerSettingsValueAtom)
const hasActiveSession = useAtomValue(() => hasActiveSessionAtom)

// Every one of these is keyed on `setupKey`, and the callback form of
// `useAtom`/`useAtomValue` re-evaluates when it changes — so switching mode or preset swaps
// the whole form over to a different draft with no watcher and no reset.
const [draft, setDraft] = useAtom(() => setupDraftAtom(setupKey.value))
const config = useAtomValue(() => setupConfigAtom(setupKey.value))
const presetDraft = useAtomValue(() => setupPresetDraftAtom(setupKey.value))
const isValidConfig = useAtomValue(() => setupValidConfigAtom(setupKey.value))
const isValidPreset = useAtomValue(() => setupValidPresetAtom(setupKey.value))

const [isStarting, setStarting] = useAtom(() => pendingAtom('timer-setup.start'))
const [isSavingPreset, setSavingPreset] = useAtom(() => pendingAtom('timer-setup.savePreset'))

/**
 * The draft is a value, so an edit is a replacement: the mode's fields hand
 * back whichever fields they changed and this folds them in.
 */
function edit(patch: Partial<TimerSetupDraft>): void {
  setDraft({ ...draft.value, ...patch })
}

const canStart = (): boolean => isValidConfig.value && !isStarting.value && !hasActiveSession.value
const canSavePreset = (): boolean => isValidPreset.value && !isSavingPreset.value

const title = (): string => modeName(routeMode.value, t)

async function start(): Promise<void> {
  if (!canStart()) return
  setStarting(true)
  unlockTimerAudio()
  const failed = reportFailure('start workout', t('timer.setup.startFailed'))
  await runStartMutation(
    createSession({
      config: config.value,
      ...(presetId.value === undefined ? {} : { presetId: presetId.value }),
      workoutNotes: draft.value.workoutNotes,
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
      Effect.ensuring(Effect.sync(() => setStarting(false))),
    ),
  )
}

async function savePreset(): Promise<void> {
  if (!canSavePreset()) return
  setSavingPreset(true)
  const failed = reportFailure('save preset', t('timer.setup.saveFailed'))
  const program = presetId.value
    ? updatePreset(presetId.value, presetDraft.value)
    : createPreset(presetDraft.value)
  await runPresetMutation(
    program.pipe(
      Effect.tap(() => Effect.sync(() => showToast(t('timer.setup.saveSuccess')))),
      Effect.catchTags({
        'Db.DatabaseError': failed,
        'Db.WorkoutInvalidError': failed,
      }),
      Effect.ensuring(Effect.sync(() => setSavingPreset(false))),
    ),
  )
}
</script>

<template>
  <PageLayout :title="t('timer.setup.title', { mode: title() })" back-to="/" :data-mode="routeMode">
    <form class="mx-auto flex w-full max-w-lg flex-col gap-section p-4" @submit.prevent="start">
      <section class="rounded-2xl border bg-card p-4 shadow-xs">
        <component :is="MODE_FIELDS[routeMode]" :draft="draft" @edit="edit" />
      </section>

      <div class="flex flex-col gap-2">
        <Label for="workout-notes">{{ t('timer.setup.workoutNotes') }}</Label>
        <Textarea
          id="workout-notes"
          :model-value="draft.workoutNotes"
          :placeholder="t('timer.setup.workoutNotesPlaceholder')"
          @update:model-value="edit({ workoutNotes: $event })"
        />
      </div>

      <section class="flex flex-col gap-3 rounded-2xl border p-4">
        <Label for="preset-name">{{ t('timer.setup.presetName') }}</Label>
        <Input
          id="preset-name"
          :model-value="draft.presetName"
          maxlength="80"
          :placeholder="t('timer.setup.presetNamePlaceholder')"
          @update:model-value="edit({ presetName: $event })"
        />
        <Button type="button" variant="outline" :disabled="!canSavePreset()" @click="savePreset">
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
          :disabled="!canStart()"
          @click="start"
        >
          {{ t('common.buttons.start') }}
        </Button>
      </div>
    </template>
  </PageLayout>
</template>
