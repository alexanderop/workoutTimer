<script setup lang="ts">
import { computed } from 'vue'

const { progress } = defineProps<{ progress: number }>()

const dashOffset = computed(() => 100 - Math.min(1, Math.max(0, progress)) * 100)
</script>

<template>
  <div class="relative grid aspect-square w-full max-w-sm place-items-center">
    <svg class="absolute inset-0 size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
      <circle
        cx="60"
        cy="60"
        r="52"
        pathLength="100"
        fill="none"
        stroke="currentColor"
        stroke-width="5"
        class="text-white/15"
      />
      <circle
        cx="60"
        cy="60"
        r="52"
        pathLength="100"
        fill="none"
        stroke="var(--mode-color)"
        stroke-linecap="round"
        stroke-width="6"
        :stroke-dasharray="100"
        :stroke-dashoffset="dashOffset"
        class="transition-[stroke-dashoffset] duration-100"
      />
    </svg>
    <div class="relative z-10 flex flex-col items-center text-center">
      <slot />
    </div>
  </div>
</template>
