<script setup lang="ts">
import { useAtom } from '@effect/atom-vue'
import { nextTick, onMounted, onUpdated, useTemplateRef } from 'vue'
import { pickerCustomOpenAtom } from '@/features/timer/atoms'
import type { PickerOption } from '@/features/timer/pickerOptions'

const props = defineProps<{
  id: string
  label: string
  modelValue: number | undefined
  options: ReadonlyArray<PickerOption>
  customLabel: string
  minutesLabel: string
  secondsLabel: string
  minSeconds: number
  maxSeconds: number
  emptyLabel?: string
}>()

// Explicit prop + emit rather than `defineModel`, which compiles to a writable
// `ref`. The value's home is the setup form's draft atom; this component only
// reports edits.
const emit = defineEmits<{ 'update:modelValue': [number | undefined] }>()

const [customOpen, setCustomOpen] = useAtom(() => pickerCustomOpenAtom(props.id))

// A `useTemplateRef` is a handle on a DOM node, not application state — the
// one `Ref` this codebase still creates on purpose.
const scroller = useTemplateRef<HTMLDivElement>('scroller')

const minutes = (): number => Math.floor((props.modelValue ?? 0) / 60)
const seconds = (): number => (props.modelValue ?? 0) % 60

function choose(value: number | undefined): void {
  emit('update:modelValue', value)
  setCustomOpen(false)
  // The scroll is left to `onUpdated`: the value's home is the parent's draft
  // atom, so the chip that will be selected is the one the parent hands back.
}

function openCustom(): void {
  const next = !customOpen.value
  setCustomOpen(next)
  if (next && props.modelValue === undefined) emit('update:modelValue', props.minSeconds)
  if (!next) void scrollToSelected('smooth')
}

function updateCustom(nextMinutes: number, nextSeconds: number): void {
  const total = Math.trunc(nextMinutes) * 60 + Math.trunc(nextSeconds)
  emit('update:modelValue', Math.min(props.maxSeconds, Math.max(props.minSeconds, total)))
}

function updateMinutes(event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  updateCustom(Number.isFinite(value) ? Math.max(0, value) : 0, seconds())
}

function updateSeconds(event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  updateCustom(minutes(), Number.isFinite(value) ? Math.min(59, Math.max(0, value)) : 0)
}

async function scrollToSelected(behavior: ScrollBehavior): Promise<void> {
  if (customOpen.value) return
  await nextTick()
  scroller.value
    ?.querySelector<HTMLElement>('[aria-pressed="true"]')
    ?.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
}

/**
 * Keep the selected chip in view whenever the value changes, whoever changed
 * it. `onUpdated` rather than a `watch`, and a plain `let` to remember what was
 * last scrolled to — a re-render for any other reason must not re-scroll.
 *
 * The parent is one of those changers, and not only at mount: a preset's saved
 * values reach the draft from IndexedDB, which resolves *after* this component
 * mounts. `onMounted` alone would scroll to the mode default and then sit still
 * while the chips changed underneath.
 */
let scrolledFor: number | undefined

onMounted(() => {
  scrolledFor = props.modelValue
  void scrollToSelected('auto')
})

onUpdated(() => {
  if (props.modelValue === scrolledFor) return
  scrolledFor = props.modelValue
  void scrollToSelected('smooth')
})
</script>

<template>
  <fieldset class="min-w-0">
    <legend class="mb-3 text-sm font-medium">{{ label }}</legend>
    <div
      ref="scroller"
      class="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      :aria-label="label"
    >
      <button
        v-if="emptyLabel"
        type="button"
        class="h-touch-target shrink-0 snap-center select-none touch-manipulation rounded-full border px-4 font-medium transition-[color,background-color,border-color,scale] duration-100 active:scale-95"
        :class="
          modelValue === undefined
            ? 'border-transparent bg-[var(--mode-color)] text-[var(--mode-foreground)]'
            : 'bg-background'
        "
        :aria-pressed="modelValue === undefined"
        @click="choose(undefined)"
      >
        {{ emptyLabel }}
      </button>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="h-touch-target shrink-0 snap-center select-none touch-manipulation rounded-full border px-4 font-medium transition-[color,background-color,border-color,scale] duration-100 active:scale-95"
        :class="
          modelValue === option.value
            ? 'border-transparent bg-[var(--mode-color)] text-[var(--mode-foreground)]'
            : 'bg-background'
        "
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

    <div
      v-if="customOpen"
      :id="`${id}-custom`"
      class="mt-2 grid grid-cols-2 gap-3 rounded-xl bg-muted p-3"
    >
      <label class="flex flex-col gap-1.5 text-xs font-medium" :for="`${id}-minutes`">
        {{ minutesLabel }}
        <input
          :id="`${id}-minutes`"
          class="h-touch-target min-w-0 rounded-lg border bg-background px-3 text-lg font-semibold"
          type="number"
          inputmode="numeric"
          min="0"
          :max="Math.floor(maxSeconds / 60)"
          :value="minutes()"
          @input="updateMinutes"
        />
      </label>
      <label class="flex flex-col gap-1.5 text-xs font-medium" :for="`${id}-seconds`">
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
  </fieldset>
</template>
