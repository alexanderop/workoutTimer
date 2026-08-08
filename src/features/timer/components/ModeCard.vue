<script setup lang="ts">
import { Activity, Gauge, Repeat2, TimerReset } from '@lucide/vue'
import type { Component } from 'vue'
import type { TimerMode } from '@/types/workout'

const { mode } = defineProps<{
  mode: TimerMode
  title: string
  description: string
}>()

const emit = defineEmits<{ select: [] }>()

const icons: Readonly<Record<TimerMode, Component>> = {
  amrap: Repeat2,
  forTime: Gauge,
  emom: TimerReset,
  tabata: Activity,
}
</script>

<template>
  <button
    type="button"
    :data-mode="mode"
    class="group flex min-h-24 w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-xs transition-transform active:scale-[0.99]"
    @click="emit('select')"
  >
    <span
      class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--mode-color)] text-[var(--mode-foreground)] shadow-sm"
    >
      <component :is="icons[mode]" class="size-7" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-lg font-bold tracking-tight">{{ title }}</span>
      <span class="mt-0.5 block text-sm text-muted-foreground">{{ description }}</span>
    </span>
    <span class="text-2xl text-[var(--mode-color)]" aria-hidden="true">›</span>
  </button>
</template>
