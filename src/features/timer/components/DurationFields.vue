<script setup lang="ts">
import { controlValue } from '@/lib/formControl'

/**
 * A minutes/seconds pair reporting one total in seconds — how a human types a
 * duration, in one place. TimePicker's custom panel and every circuit block
 * row render this; the only divergence between them is whether the total is
 * clamped, so that is a prop: with `minSeconds`/`maxSeconds` the total is held
 * to the range, without them an unusable zero passes through so validation
 * can refuse it out loud.
 */
const props = defineProps<{
  id: string
  modelValue: number
  minutesLabel: string
  secondsLabel: string
  minSeconds?: number
  maxSeconds?: number
}>()

// Explicit prop + emit rather than `defineModel` — see TimePicker.vue.
const emit = defineEmits<{ 'update:modelValue': [number] }>()

const minutes = (): number => Math.floor(props.modelValue / 60)
const seconds = (): number => props.modelValue % 60

function updateTotal(nextMinutes: number, nextSeconds: number): void {
  let total = Math.trunc(nextMinutes) * 60 + Math.trunc(nextSeconds)
  if (props.maxSeconds !== undefined) total = Math.min(props.maxSeconds, total)
  if (props.minSeconds !== undefined) total = Math.max(props.minSeconds, total)
  emit('update:modelValue', total)
}

function updateMinutes(event: Event): void {
  const value = Number(controlValue(event))
  updateTotal(Number.isFinite(value) ? Math.max(0, value) : 0, seconds())
}

function updateSeconds(event: Event): void {
  const value = Number(controlValue(event))
  updateTotal(minutes(), Number.isFinite(value) ? Math.min(59, Math.max(0, value)) : 0)
}

// 24 hours — the schema's own ceiling on any duration — when no cap is given.
const maxMinutes = (): number => Math.floor((props.maxSeconds ?? 86_400) / 60)
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <label class="flex min-w-0 flex-col gap-1.5 text-xs font-medium" :for="`${id}-minutes`">
      {{ minutesLabel }}
      <input
        :id="`${id}-minutes`"
        class="h-touch-target min-w-0 rounded-lg border bg-background px-3 text-lg font-semibold"
        type="number"
        inputmode="numeric"
        min="0"
        :max="maxMinutes()"
        :value="minutes()"
        @input="updateMinutes"
      />
    </label>
    <label class="flex min-w-0 flex-col gap-1.5 text-xs font-medium" :for="`${id}-seconds`">
      {{ secondsLabel }}
      <input
        :id="`${id}-seconds`"
        class="h-touch-target min-w-0 rounded-lg border bg-background px-3 text-lg font-semibold"
        type="number"
        inputmode="numeric"
        min="0"
        max="59"
        :value="seconds()"
        @input="updateSeconds"
      />
    </label>
  </div>
</template>
