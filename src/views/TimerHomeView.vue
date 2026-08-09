<script setup lang="ts">
import { Bookmark, Play } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import ModeCard from '@/features/timer/components/ModeCard.vue'
import { formatDuration, sortPresets } from '@/features/timer/domain'
import { RouteNames } from '@/router'
import { usePresets, useSessions } from '@/stores/timerData'
import type { TimerConfig, TimerMode } from '@/db'

const { t } = useI18n()
const router = useRouter()
const { data: sessions, failed: sessionsFailed } = useSessions()
const { data: presets, failed: presetsFailed } = usePresets()
const loadFailed = computed(() => sessionsFailed.value || presetsFailed.value)
const activeSession = computed(() =>
  sessions.value.find((session) => ['countdown', 'running', 'paused'].includes(session.status)),
)
const recentPresets = computed(() => sortPresets(presets.value).slice(0, 4))
const modes: ReadonlyArray<TimerMode> = ['amrap', 'forTime', 'emom', 'tabata']

function modeName(mode: TimerMode): string {
  switch (mode) {
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

function modeDescription(mode: TimerMode): string {
  switch (mode) {
    case 'amrap':
      return t('timer.modes.amrap.description')
    case 'forTime':
      return t('timer.modes.forTime.description')
    case 'emom':
      return t('timer.modes.emom.description')
    case 'tabata':
      return t('timer.modes.tabata.description')
  }
}

function configSummary(config: TimerConfig): string {
  switch (config.mode) {
    case 'amrap':
      return formatDuration(config.durationMs)
    case 'forTime':
      return config.timeCapMs === undefined
        ? modeDescription('forTime')
        : formatDuration(config.timeCapMs)
    case 'emom':
      return `${config.rounds} × ${formatDuration(config.intervalMs)}`
    case 'tabata':
      return `${config.rounds} × ${formatDuration(config.workMs)} / ${formatDuration(config.restMs)}`
  }
}

function openMode(mode: TimerMode): void {
  void router.push({ name: RouteNames.timerSetup, params: { mode } })
}
</script>

<template>
  <PageLayout :title="t('timer.title')" :subtitle="t('timer.subtitle')" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div v-if="loadFailed" role="alert" class="rounded-xl border border-dashed p-6 text-center">
        <p class="text-sm text-muted-foreground">{{ t('common.loadError') }}</p>
      </div>

      <section
        v-if="activeSession"
        :data-mode="activeSession.config.mode"
        class="rounded-2xl border-2 border-[var(--mode-color)] bg-card p-4 shadow-sm"
      >
        <div class="flex items-center gap-3">
          <span
            class="grid size-11 place-items-center rounded-full bg-[var(--mode-color)] text-[var(--mode-foreground)]"
          >
            <Play class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="font-bold">{{ t('timer.resume.title') }}</h2>
            <p class="text-sm text-muted-foreground">{{ t('timer.resume.body') }}</p>
          </div>
        </div>
        <Button
          class="mt-4 w-full bg-[var(--mode-color)] text-[var(--mode-foreground)]"
          @click="router.push({ name: RouteNames.timerRun, params: { id: activeSession.id } })"
        >
          {{ t('timer.resume.action') }}
        </Button>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="timer-modes-heading">
        <h2 id="timer-modes-heading" class="sr-only">{{ t('timer.title') }}</h2>
        <ModeCard
          v-for="mode in modes"
          :key="mode"
          :mode="mode"
          :title="modeName(mode)"
          :description="modeDescription(mode)"
          @select="openMode(mode)"
        />
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="recent-presets-heading">
        <div class="flex items-center justify-between gap-3">
          <h2 id="recent-presets-heading" class="text-section-title font-semibold">
            {{ t('timer.recentPresets') }}
          </h2>
          <Button variant="ghost" size="sm" @click="router.push({ name: RouteNames.presets })">
            {{ t('timer.viewPresets') }}
          </Button>
        </div>

        <div
          v-if="recentPresets.length === 0"
          class="rounded-xl border border-dashed p-5 text-center"
        >
          <Bookmark class="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p class="mt-2 text-sm text-muted-foreground">{{ t('timer.noPresets') }}</p>
        </div>
        <button
          v-for="preset in recentPresets"
          v-else
          :key="preset.id"
          type="button"
          :data-mode="preset.config.mode"
          class="flex min-h-touch-target items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left"
          @click="
            router.push({
              name: RouteNames.timerSetup,
              params: { mode: preset.config.mode },
              query: { preset: preset.id },
            })
          "
        >
          <span>
            <span class="block font-semibold">{{ preset.name }}</span>
            <span class="block text-sm text-muted-foreground">{{
              configSummary(preset.config)
            }}</span>
          </span>
          <span class="size-3 rounded-full bg-[var(--mode-color)]" aria-hidden="true" />
        </button>
      </section>
    </div>
  </PageLayout>
</template>
