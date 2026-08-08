<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { useReportFailure } from '@/composables/useReportFailure'
import { deleteSession, sessionMutation } from '@/db'
import { deriveTimer, formatDuration } from '@/features/timer/domain'
import { RouteNames } from '@/router'
import { sessionsAtom } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'
import type { TimerConfig } from '@/db'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const runMutation = useAtomSet(() => sessionMutation, { mode: 'promise' })
const reportFailure = useReportFailure('session-detail')
const sessionsResult = useAtomValue(() => sessionsAtom)
const sessions = computed(() => AsyncResult.getOrElse(sessionsResult.value, () => []))
const session = computed(() => sessions.value.find((item) => item.id === String(route.params.id)))
const result = computed(() => {
  const current = session.value
  return current ? deriveTimer(current, current.finishedAt ?? Date.now()) : undefined
})
const deleteArmed = ref(false)
let deleteTimeout: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  if (deleteTimeout) clearTimeout(deleteTimeout)
})

function modeName(): string {
  switch (session.value?.config.mode) {
    case 'amrap':
      return t('timer.modes.amrap.name')
    case 'forTime':
      return t('timer.modes.forTime.name')
    case 'emom':
      return t('timer.modes.emom.name')
    case 'tabata':
      return t('timer.modes.tabata.name')
    default:
      return t('history.detail')
  }
}

function configSummary(config: TimerConfig): string {
  switch (config.mode) {
    case 'amrap':
      return formatDuration(config.durationMs)
    case 'forTime':
      return config.timeCapMs
        ? formatDuration(config.timeCapMs)
        : t('timer.modes.forTime.description')
    case 'emom':
      return `${config.rounds} × ${formatDuration(config.intervalMs)}`
    case 'tabata':
      return `${config.rounds} × ${formatDuration(config.workMs)} / ${formatDuration(config.restMs)}`
  }
}

async function remove(): Promise<void> {
  const current = session.value
  if (!current) return
  if (!deleteArmed.value) {
    deleteArmed.value = true
    deleteTimeout = setTimeout(() => {
      deleteArmed.value = false
    }, 3_000)
    return
  }
  let deleted = false
  await runMutation(
    deleteSession(current.id).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          deleted = true
        }),
      ),
      Effect.catchTag(
        'Db.DatabaseError',
        reportFailure('delete workout', t('history.deleteFailed')),
      ),
    ),
  )
  if (deleted) {
    toast.showToast(t('history.deleted'))
    await router.replace({ name: RouteNames.history })
  }
}
</script>

<template>
  <PageLayout :title="modeName()" back-to="/history">
    <div
      v-if="session && result"
      :data-mode="session.config.mode"
      class="mx-auto flex w-full max-w-lg flex-col gap-section p-4"
    >
      <section class="grid grid-cols-2 gap-3">
        <div class="rounded-2xl bg-[var(--mode-color)] p-4 text-[var(--mode-foreground)]">
          <p class="text-sm opacity-75">{{ t('timer.result.elapsed') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ formatDuration(result.elapsedMs) }}</p>
        </div>
        <div class="rounded-2xl border bg-card p-4">
          <p class="text-sm text-muted-foreground">{{ t('timer.result.rounds') }}</p>
          <p class="mt-1 text-2xl font-bold">{{ session.rounds.length }}</p>
        </div>
      </section>

      <section class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.configuration') }}</h2>
        <p class="mt-2 text-muted-foreground">{{ configSummary(session.config) }}</p>
      </section>

      <section v-if="session.workoutNotes" class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.workoutNotes') }}</h2>
        <p class="mt-2 whitespace-pre-line text-muted-foreground">{{ session.workoutNotes }}</p>
      </section>

      <section class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.resultNotes') }}</h2>
        <p class="mt-2 whitespace-pre-line text-muted-foreground">
          {{ session.notes || t('history.noNotes') }}
        </p>
      </section>

      <section v-if="session.rounds.length" class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.roundSplits') }}</h2>
        <ol class="mt-3 space-y-2">
          <li
            v-for="(round, index) in session.rounds"
            :key="`${round.capturedAtElapsedMs}-${index}`"
            class="flex justify-between border-b pb-2 last:border-0"
          >
            <span>{{ index + 1 }}</span>
            <span class="font-medium tabular-nums">{{
              formatDuration(round.capturedAtElapsedMs)
            }}</span>
          </li>
        </ol>
      </section>

      <Button variant="destructive" @click="remove">
        {{ deleteArmed ? t('history.deleteConfirm') : t('history.delete') }}
      </Button>
    </div>
    <div v-else class="grid min-h-64 place-items-center p-6">
      <p role="alert">{{ t('timer.run.missing') }}</p>
    </div>
  </PageLayout>
</template>
