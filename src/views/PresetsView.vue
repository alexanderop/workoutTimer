<script setup lang="ts">
import { injectRegistry, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Copy, Pencil, Play, Trash2 } from '@lucide/vue'
import { Effect } from 'effect'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { createPreset, deletePreset, presetMutation } from '@/db'
import { sortedPresetsAtom } from '@/features/timer/atoms'
import { formatDuration } from '@/features/timer/domain'
import { failureReporter } from '@/lib/reportFailure'
import { RouteNames } from '@/router'
import { armedConfirmationAtom, requestConfirmationIn } from '@/state/confirmation'
import { presetsLoadFailedAtom } from '@/state/timerData'
import { showToastAtom } from '@/state/toast'
import type { TimerConfig, TimerPreset } from '@/db'

const { t } = useI18n()
const router = useRouter()
const registry = injectRegistry()
const showToast = useAtomSet(() => showToastAtom)
const reportFailure = failureReporter('presets', showToast)
const runMutation = useAtomSet(() => presetMutation, { mode: 'promise' })
const presets = useAtomValue(() => sortedPresetsAtom)
const loadFailed = useAtomValue(() => presetsLoadFailedAtom)
const failed = reportFailure('change preset', t('presets.actionFailed'))

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

function usePreset(preset: TimerPreset): void {
  void router.push({
    name: RouteNames.timerSetup,
    params: { mode: preset.config.mode },
    query: { preset: preset.id },
  })
}

function duplicate(preset: TimerPreset): Promise<unknown> {
  return runMutation(
    createPreset({
      name: `${preset.name} ${t('presets.duplicateSuffix')}`,
      config: preset.config,
      workoutNotes: preset.workoutNotes,
    }).pipe(
      Effect.tap(() => Effect.sync(() => showToast(t('presets.duplicated')))),
      Effect.catchTags({ 'Db.DatabaseError': failed, 'Db.WorkoutInvalidError': failed }),
    ),
  )
}

// Reading the atom is both what the button label needs and what keeps the
// confirmation mounted, so its 3 s expiry has a registry to write back to.
const armedPresetId = useAtomValue(() => armedConfirmationAtom('presets'))

function remove(preset: TimerPreset): Promise<unknown> {
  if (!requestConfirmationIn(registry, 'presets', preset.id)) return Promise.resolve()
  return runMutation(
    deletePreset(preset.id).pipe(
      Effect.tap(() => Effect.sync(() => showToast(t('presets.deleted')))),
      Effect.catchTag('Db.DatabaseError', failed),
    ),
  )
}
</script>

<template>
  <PageLayout :title="t('presets.title')" back-to="/">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-3 p-4">
      <div v-if="loadFailed" role="alert" class="rounded-xl border border-dashed p-6 text-center">
        {{ t('common.loadError') }}
      </div>
      <div
        v-else-if="presets.length === 0"
        class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        {{ t('presets.empty') }}
      </div>
      <article
        v-for="preset in presets"
        v-else
        :key="preset.id"
        :data-mode="preset.config.mode"
        class="rounded-2xl border bg-card p-4 shadow-xs"
      >
        <div class="flex items-start gap-3">
          <span class="mt-1 size-3 rounded-full bg-[var(--mode-color)]" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <h2 class="font-bold">{{ preset.name }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{{ configSummary(preset.config) }}</p>
            <p v-if="preset.workoutNotes" class="mt-2 line-clamp-2 text-sm">
              {{ preset.workoutNotes }}
            </p>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-4 gap-2">
          <Button
            size="icon"
            :aria-label="t('presets.use', { name: preset.name })"
            @click="usePreset(preset)"
            ><Play
          /></Button>
          <Button
            size="icon"
            variant="outline"
            :aria-label="t('presets.edit', { name: preset.name })"
            @click="usePreset(preset)"
            ><Pencil
          /></Button>
          <Button
            size="icon"
            variant="outline"
            :aria-label="t('presets.duplicate', { name: preset.name })"
            @click="duplicate(preset)"
            ><Copy
          /></Button>
          <Button
            size="icon"
            :variant="armedPresetId === preset.id ? 'destructive' : 'ghost'"
            :aria-label="
              armedPresetId === preset.id
                ? t('presets.deleteConfirm', { name: preset.name })
                : t('presets.delete', { name: preset.name })
            "
            @click="remove(preset)"
            ><Trash2
          /></Button>
        </div>
      </article>
    </div>
  </PageLayout>
</template>
