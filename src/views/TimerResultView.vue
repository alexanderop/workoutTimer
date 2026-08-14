<script setup lang="ts">
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Check } from '@lucide/vue'
import { Effect } from 'effect'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { sessionMutation, updateSessionNotes } from '@/db'
import {
  currentSessionAtom,
  currentSessionResultAtom,
  resultNotesAtom,
} from '@/features/timer/atoms'
import { formatDuration } from '@/features/timer/domain'
import { failureReporter } from '@/lib/reportFailure'
import { RouteNames } from '@/router'
import { pendingAtom } from '@/state/pending'
import { routeParamAtom } from '@/state/route'
import { showToastAtom } from '@/state/toast'

const { t } = useI18n()
const router = useRouter()
const runMutation = useAtomSet(() => sessionMutation, { mode: 'promise' })
const showToast = useAtomSet(() => showToastAtom)
const reportFailure = failureReporter('timer-result', showToast)

const session = useAtomValue(() => currentSessionAtom)
const result = useAtomValue(() => currentSessionResultAtom)
const sessionId = useAtomValue(() => routeParamAtom('id'))
// The atom-returning callback is re-evaluated when `sessionId` changes, so
// navigating between two results swaps the draft rather than carrying it over.
const [notes, setNotes] = useAtom(() => resultNotesAtom(sessionId.value ?? ''))
const [isSaving, setSaving] = useAtom(() => pendingAtom('timer-result.save'))

async function save(): Promise<void> {
  const current = session.value
  if (!current || isSaving.value) return
  setSaving(true)
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
      Effect.ensuring(Effect.sync(() => setSaving(false))),
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
          <dd class="mt-1 text-2xl font-bold">{{ result.completedRounds }}</dd>
        </div>
      </dl>

      <div class="flex w-full flex-col gap-2">
        <Label for="result-notes" class="text-white">{{ t('timer.result.notes') }}</Label>
        <Textarea
          id="result-notes"
          :model-value="notes"
          class="border-white/20 bg-white/8 text-white placeholder:text-white/45"
          :placeholder="t('timer.result.notesPlaceholder')"
          @update:model-value="setNotes"
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
