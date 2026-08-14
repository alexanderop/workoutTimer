<script setup lang="ts">
import { useAtomValue } from '@effect/atom-vue'
import { Bookmark, Play } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { activeSessionAtom, homeLoadFailedAtom, recentPresetsAtom } from '@/features/timer/atoms'
import ModeCard from '@/features/timer/components/ModeCard.vue'
import { TIMER_MODES } from '@/features/timer/domain'
import { configSummary, modeDescription, modeName } from '@/features/timer/labels'
import { RouteNames } from '@/router'
import type { TimerConfig, TimerMode } from '@/db'

const { t } = useI18n()
const router = useRouter()

const loadFailed = useAtomValue(() => homeLoadFailedAtom)
const activeSession = useAtomValue(() => activeSessionAtom)
const recentPresets = useAtomValue(() => recentPresetsAtom)

const name = (mode: TimerMode): string => modeName(mode, t)
const description = (mode: TimerMode): string => modeDescription(mode, t)
const summary = (config: TimerConfig): string => configSummary(config, t)

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
          v-for="mode in TIMER_MODES"
          :key="mode"
          :mode="mode"
          :title="name(mode)"
          :description="description(mode)"
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
            <span class="block text-sm text-muted-foreground">{{ summary(preset.config) }}</span>
          </span>
          <span class="size-3 rounded-full bg-[var(--mode-color)]" aria-hidden="true" />
        </button>
      </section>
    </div>
  </PageLayout>
</template>
