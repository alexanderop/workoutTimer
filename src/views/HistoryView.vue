<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { deriveTimer, formatDuration, sortSessions } from '@/features/timer/domain'
import { RouteNames } from '@/router'
import { useSessions } from '@/stores/timerData'
import type { SessionStatus, WorkoutSession } from '@/db'

type Filter = 'all' | 'completed' | 'cancelled'

const { t, locale } = useI18n()
const router = useRouter()
const { data: storedSessions, failed: loadFailed } = useSessions()
const filter = ref<Filter>('all')
const sessions = computed(() =>
  sortSessions(storedSessions.value).filter(
    (session) =>
      ['completed', 'cancelled'].includes(session.status) &&
      (filter.value === 'all' || session.status === filter.value),
  ),
)
const filters: ReadonlyArray<Filter> = ['all', 'completed', 'cancelled']

function filterLabel(value: Filter): string {
  return value === 'all'
    ? t('history.all')
    : value === 'completed'
      ? t('history.completed')
      : t('history.cancelled')
}

function modeName(session: WorkoutSession): string {
  switch (session.config.mode) {
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

function resultLabel(session: WorkoutSession): string {
  const result = deriveTimer(session, session.finishedAt ?? Date.now())
  const rounds =
    result.completedRounds > 0 ? ` · ${result.completedRounds} ${t('timer.result.rounds')}` : ''
  return `${formatDuration(result.elapsedMs)}${rounds}`
}

function statusClass(status: SessionStatus): string {
  return status === 'cancelled' ? 'text-muted-foreground' : 'text-[var(--mode-color)]'
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
    timestamp,
  )
}
</script>

<template>
  <PageLayout :title="t('history.title')" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div class="flex gap-2 overflow-x-auto" role="group" :aria-label="t('history.title')">
        <Button
          v-for="item in filters"
          :key="item"
          size="sm"
          :variant="filter === item ? 'default' : 'outline'"
          @click="filter = item"
        >
          {{ filterLabel(item) }}
        </Button>
      </div>

      <div v-if="loadFailed" role="alert" class="rounded-xl border border-dashed p-6 text-center">
        {{ t('common.loadError') }}
      </div>
      <div
        v-else-if="sessions.length === 0"
        class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        {{ t('history.empty') }}
      </div>
      <ul v-else class="flex list-none flex-col gap-3 p-0">
        <li v-for="session in sessions" :key="session.id">
          <button
            type="button"
            :data-mode="session.config.mode"
            class="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs"
            @click="router.push({ name: RouteNames.sessionDetail, params: { id: session.id } })"
          >
            <span
              class="h-12 w-1.5 shrink-0 rounded-full bg-[var(--mode-color)]"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-3">
                <span class="font-bold" :class="statusClass(session.status)">{{
                  modeName(session)
                }}</span>
                <span class="text-xs text-muted-foreground">{{
                  formatDate(session.createdAt)
                }}</span>
              </span>
              <span class="mt-1 block text-sm text-muted-foreground">{{
                resultLabel(session)
              }}</span>
            </span>
            <ChevronRight class="size-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </PageLayout>
</template>
