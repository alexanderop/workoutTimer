<script setup lang="ts">
import { injectRegistry, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { deleteSession, sessionMutation } from '@/db'
import { currentSessionAtom, currentSessionResultAtom } from '@/features/timer/atoms'
import { formatDuration } from '@/features/timer/domain'
import { configSummary, modeName } from '@/features/timer/labels'
import { failureReporter } from '@/lib/reportFailure'
import { RouteNames } from '@/router'
import { armedConfirmationAtom, requestConfirmationIn } from '@/state/confirmation'
import { showToastAtom } from '@/state/toast'
import type { TimerConfig } from '@/db'

const { t } = useI18n()
const router = useRouter()
const registry = injectRegistry()
const showToast = useAtomSet(() => showToastAtom)
const runMutation = useAtomSet(() => sessionMutation, { mode: 'promise' })
const reportFailure = failureReporter('session-detail', showToast)
const session = useAtomValue(() => currentSessionAtom)
const result = useAtomValue(() => currentSessionResultAtom)
// Read as well as write: the label says "really delete?" while armed, and the
// subscription is what gives the 3 s expiry a registry to write back to.
const armedKey = useAtomValue(() => armedConfirmationAtom('session-detail'))

// The page title before the row arrives — and for a `/history/:id` that names
// no workout this app has.
const title = (): string => {
  const config = session.value?.config
  return config === undefined ? t('history.detail') : modeName(config.mode, t)
}

const summary = (config: TimerConfig): string => configSummary(config, t)

async function remove(): Promise<void> {
  const current = session.value
  if (!current) return
  if (!requestConfirmationIn(registry, 'session-detail', 'delete')) return
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
    showToast(t('history.deleted'))
    await router.replace({ name: RouteNames.history })
  }
}
</script>

<template>
  <PageLayout :title="title()" back-to="/history">
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
          <p class="mt-1 text-2xl font-bold">{{ result.completedRounds }}</p>
        </div>
      </section>

      <section class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.configuration') }}</h2>
        <p class="mt-2 text-muted-foreground">{{ summary(session.config) }}</p>
      </section>

      <!-- `select-text` on both bodies: the app suppresses selection globally
           because chrome is not a document, but these two are the user's own
           prose and copying them out is a thing someone wants to do. -->
      <section v-if="session.workoutNotes" class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.workoutNotes') }}</h2>
        <p class="mt-2 select-text whitespace-pre-line text-muted-foreground">
          {{ session.workoutNotes }}
        </p>
      </section>

      <section class="rounded-2xl border bg-card p-4">
        <h2 class="text-section-title font-semibold">{{ t('history.resultNotes') }}</h2>
        <p class="mt-2 select-text whitespace-pre-line text-muted-foreground">
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
        {{ armedKey === 'delete' ? t('history.deleteConfirm') : t('history.delete') }}
      </Button>
    </div>
    <div v-else class="grid min-h-64 place-items-center p-6">
      <p role="alert">{{ t('timer.run.missing') }}</p>
    </div>
  </PageLayout>
</template>
