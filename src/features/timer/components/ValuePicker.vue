<script setup lang="ts">
import { useAtom } from '@effect/atom-vue'
import { pickerCustomOpenAtom } from '@/features/timer/atoms'
import { chipClass } from '@/features/timer/components/chip'
import type { PickerOption } from '@/features/timer/pickerOptions'
import { controlValue } from '@/lib/formControl'

const props = defineProps<{
  id: string
  label: string
  modelValue: number | undefined
  options: ReadonlyArray<PickerOption>
  emptyLabel?: string
  customLabel: string
}>()

// Explicit prop + emit rather than `defineModel` — see TimePicker.vue.
const emit = defineEmits<{ 'update:modelValue': [number | undefined] }>()

const [customOpen, setCustomOpen] = useAtom(() => pickerCustomOpenAtom(props.id))

function choose(value: number | undefined): void {
  emit('update:modelValue', value)
  setCustomOpen(false)
}

function openCustom(): void {
  const next = !customOpen.value
  setCustomOpen(next)
  if (next && props.modelValue === undefined) emit('update:modelValue', 1)
}

function updateValue(event: Event): void {
  const value = Number(controlValue(event))
  emit('update:modelValue', Math.min(999, Math.max(1, Math.trunc(value || 1))))
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
        :class="[chipClass(modelValue === undefined), 'snap-center']"
        :aria-pressed="modelValue === undefined"
        @click="choose(undefined)"
      >
        {{ emptyLabel }}
      </button>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="[chipClass(modelValue === option.value), 'snap-center']"
        :aria-pressed="modelValue === option.value"
        @click="choose(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
    <button
      type="button"
      class="mt-2 min-h-touch-target w-full select-none touch-manipulation rounded-xl border border-dashed bg-background px-3 text-sm font-semibold text-muted-foreground transition-[color,border-color,scale] duration-100 hover:border-foreground/40 hover:text-foreground active:scale-[0.98]"
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
        :value="modelValue ?? 1"
        @input="updateValue"
      />
    </label>
  </fieldset>
</template>
