<script setup lang="ts">
import { ref } from 'vue'
import type { PickerOption } from '@/features/timer/pickerOptions'

defineProps<{
  id: string
  label: string
  options: ReadonlyArray<PickerOption>
  emptyLabel?: string
  customLabel: string
}>()

const model = defineModel<number | undefined>({ required: true })
const customOpen = ref(false)

function choose(value: number | undefined): void {
  model.value = value
  customOpen.value = false
}

function openCustom(): void {
  customOpen.value = !customOpen.value
  if (customOpen.value && model.value === undefined) model.value = 1
}

function updateValue(event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  model.value = Math.min(999, Math.max(1, Math.trunc(value || 1)))
}
</script>

<template>
  <fieldset class="min-w-0">
    <legend class="mb-3 text-sm font-medium">{{ label }}</legend>
    <div
      class="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      :aria-label="label"
    >
      <button
        v-if="emptyLabel"
        type="button"
        class="h-touch-target shrink-0 snap-center rounded-full border px-4 font-medium transition-colors"
        :class="
          model === undefined
            ? 'border-transparent bg-[var(--mode-color)] text-[var(--mode-foreground)]'
            : 'bg-background'
        "
        :aria-pressed="model === undefined"
        @click="choose(undefined)"
      >
        {{ emptyLabel }}
      </button>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="h-touch-target shrink-0 snap-center rounded-full border px-4 font-medium transition-colors"
        :class="
          model === option.value
            ? 'border-transparent bg-[var(--mode-color)] text-[var(--mode-foreground)]'
            : 'bg-background'
        "
        :aria-pressed="model === option.value"
        @click="choose(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
    <button
      type="button"
      class="mt-2 min-h-touch-target w-full rounded-xl border border-dashed bg-background px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      :class="customOpen ? 'border-[var(--mode-color)] text-foreground' : ''"
      :aria-expanded="customOpen"
      :aria-controls="`${id}-custom`"
      @click="openCustom"
    >
      {{ customLabel }}
    </button>
    <label
      v-if="customOpen"
      :id="`${id}-custom`"
      class="mt-2 flex flex-col gap-1.5 rounded-xl bg-muted p-3 text-xs font-medium"
      :for="`${id}-value`"
    >
      {{ customLabel }}
      <input
        :id="`${id}-value`"
        class="h-touch-target rounded-lg border bg-background px-3 text-lg font-semibold"
        type="number"
        inputmode="numeric"
        min="1"
        max="999"
        :value="model ?? 1"
        @input="updateValue"
      />
    </label>
  </fieldset>
</template>
