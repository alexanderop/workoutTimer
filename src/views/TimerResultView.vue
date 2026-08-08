<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Check } from '@lucide/vue'
import { Effect } from 'effect'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useReportFailure } from '@/composables/useReportFailure'
import { sessionMutation, updateSessionNotes } from '@/db'
import { deriveTimer, formatDuration } from '@/features/timer/domain'
import { RouteNames } from '@/router'
import { sessionsAtom } from '@/stores/timerData'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const runMutation = useAtomSet(() => sessionMutation, { mode: 'promise' })
const reportFailure = useReportFailure('timer-result')
const sessionsResult = useAtomValue(() => sessionsAtom)
const sessions = computed(() => AsyncResult.getOrElse(sessionsResult.value, () => []))
const session = computed(() => sessions.value.find((item) => item.id === String(route.params.id)))
const result = computed(() => {
  const current = session.value
  return current ? deriveTimer(current, current.finishedAt ?? Date.now()) : undefined
})
const notes = ref('')
const isSaving = ref(false)

watch(
  session,
  (current) => {
    notes.value = current?.notes ?? ''
  },
  { immediate: true },
)

async function save(): Promise<void> {
  const current = session.value
  if (!current || isSaving.value) return
  isSaving.value = true
  let saved = false
  await runMutation(
    updateSessionNotes(current.id, notes.value).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          saved = true
        }),
      ),
      Effect.catchTag(
        'Db.DatabaseError',
        reportFailure('save result notes', t('timer.result.saveFailed')),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          isSaving.value = false
        }),
      ),
    ),
  )
  if (saved) {
    await router.replace({ name: RouteNames.sessionDetail, params: { id: current.id } })
  }
}
</script>

<template>
  <div
    :data-mode="session?.config.mode ?? 'amrap'"
    class="flex min-h-dvh flex-col bg-neutral-950 text-white safe-area-bottom"
  >
    <main
      v-if="session && result"
      class="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 p-5"
    >
      <div
        class="relative grid size-32 place-items-center rounded-full bg-[var(--mode-color)] text-[var(--mode-foreground)] shadow-[0_0_80px_color-mix(in_oklab,var(--mode-color)_45%,transparent)]"
      >
        <Check class="size-16" stroke-width="3" aria-hidden="true" />
      </div>
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">{{ t('timer.result.title') }}</h1>
        <p class="mt-2 text-white/65">{{ t('timer.result.subtitle') }}</p>
      </div>

      <dl class="grid w-full grid-cols-2 gap-3 text-center">
        <div class="rounded-2xl bg-white/8 p-4">
          <dt class="text-sm text-white/60">{{ t('timer.result.elapsed') }}</dt>
          <dd class="mt-1 text-2xl font-bold tabular-nums">
            {{ formatDuration(result.elapsedMs) }}
          </dd>
        </div>
        <div class="rounded-2xl bg-white/8 p-4">
          <dt class="text-sm text-white/60">{{ t('timer.result.rounds') }}</dt>
          <dd class="mt-1 text-2xl font-bold">{{ session.rounds.length }}</dd>
        </div>
      </dl>

      <div class="flex w-full flex-col gap-2">
        <Label for="result-notes" class="text-white">{{ t('timer.result.notes') }}</Label>
        <Textarea
          id="result-notes"
          v-model="notes"
          class="border-white/20 bg-white/8 text-white placeholder:text-white/45"
          :placeholder="t('timer.result.notesPlaceholder')"
        />
      </div>

      <Button
        class="h-14 w-full bg-[var(--mode-color)] text-base text-[var(--mode-foreground)]"
        :disabled="isSaving"
        @click="save"
      >
        {{ t('timer.result.save') }}
      </Button>
    </main>
    <main v-else class="grid flex-1 place-items-center p-6">
      <p role="alert">{{ t('timer.run.missing') }}</p>
    </main>
  </div>
</template>
