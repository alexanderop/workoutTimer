<script setup lang="ts">
import { ChevronDown, ChevronUp, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAX_CIRCUIT_BLOCKS } from '@/features/timer/domain'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import {
  appendCircuitBlock,
  moveCircuitBlock,
  removeCircuitBlock,
  roundOptions,
  updateCircuitBlock,
  type CircuitBlockDraft,
} from '@/features/timer/setupForm'

const props = defineProps<{
  blocks: ReadonlyArray<CircuitBlockDraft>
  repeat: number
}>()

// Explicit props + emits rather than `defineModel` — see TimePicker.vue. The
// list's home is the setup form's draft atom; every gesture here emits a whole
// new array, so an edit stays a replacement like any other draft field.
const emit = defineEmits<{
  'update:blocks': [ReadonlyArray<CircuitBlockDraft>]
  'update:repeat': [number]
}>()

const { t } = useI18n()

/** What a block is called out loud: its label, or its position when unnamed. */
function blockName(index: number): string {
  const label = props.blocks[index]?.label.trim() ?? ''
  return label === '' ? t('timer.setup.block', { index: index + 1 }) : label
}

function patch(index: number, change: Partial<CircuitBlockDraft>): void {
  emit('update:blocks', updateCircuitBlock(props.blocks, index, change))
}

const minutes = (block: CircuitBlockDraft): number => Math.floor(block.durationSeconds / 60)
const seconds = (block: CircuitBlockDraft): number => block.durationSeconds % 60

function updateDuration(index: number, nextMinutes: number, nextSeconds: number): void {
  // An unusable zero passes through so `isTimerConfig` can refuse it out
  // loud, the same rule the For Time cap follows.
  patch(index, { durationSeconds: Math.trunc(nextMinutes) * 60 + Math.trunc(nextSeconds) })
}

function updateMinutes(index: number, event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  const block = props.blocks[index]
  if (block === undefined) return
  updateDuration(index, Number.isFinite(value) ? Math.max(0, value) : 0, seconds(block))
}

function updateSeconds(index: number, event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  const block = props.blocks[index]
  if (block === undefined) return
  updateDuration(
    index,
    minutes(block),
    Number.isFinite(value) ? Math.min(59, Math.max(0, value)) : 0,
  )
}

const kindChipClass = (selected: boolean): string =>
  `h-touch-target shrink-0 select-none touch-manipulation rounded-full border px-4 text-sm font-medium transition-[color,background-color,border-color,scale] duration-100 active:scale-95 ${
    selected
      ? 'border-transparent bg-[var(--mode-color)] text-[var(--mode-foreground)]'
      : 'bg-background'
  }`
</script>

<template>
  <div class="flex flex-col gap-5">
    <fieldset class="min-w-0">
      <legend class="mb-3 text-sm font-medium">{{ t('timer.setup.blocks') }}</legend>
      <ol class="flex flex-col gap-3">
        <li v-for="(block, index) in blocks" :key="index">
          <fieldset class="rounded-xl bg-muted p-3">
            <legend class="sr-only">{{ blockName(index) }}</legend>
            <div class="flex items-center gap-2">
              <Input
                class="min-w-0 flex-1 bg-background"
                :model-value="block.label"
                maxlength="40"
                :aria-label="`${t('timer.setup.block', { index: index + 1 })} — ${t('timer.setup.blockName')}`"
                :placeholder="t('timer.setup.blockNamePlaceholder')"
                @update:model-value="patch(index, { label: $event })"
              />
              <button
                type="button"
                :class="kindChipClass(block.kind === 'work')"
                :aria-pressed="block.kind === 'work'"
                @click="patch(index, { kind: 'work' })"
              >
                {{ t('timer.setup.work') }}
              </button>
              <button
                type="button"
                :class="kindChipClass(block.kind === 'rest')"
                :aria-pressed="block.kind === 'rest'"
                @click="patch(index, { kind: 'rest' })"
              >
                {{ t('timer.setup.rest') }}
              </button>
            </div>
            <div class="mt-2 flex items-end gap-2">
              <label
                class="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium"
                :for="`block-${index}-minutes`"
              >
                {{ t('timer.setup.minutes') }}
                <input
                  :id="`block-${index}-minutes`"
                  class="h-touch-target min-w-0 rounded-lg border bg-background px-3 text-lg font-semibold"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="1440"
                  :value="minutes(block)"
                  @input="updateMinutes(index, $event)"
                />
              </label>
              <label
                class="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium"
                :for="`block-${index}-seconds`"
              >
                {{ t('timer.setup.seconds') }}
                <input
                  :id="`block-${index}-seconds`"
                  class="h-touch-target min-w-0 rounded-lg border bg-background px-3 text-lg font-semibold"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="59"
                  :value="seconds(block)"
                  @input="updateSeconds(index, $event)"
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :disabled="index === 0"
                :aria-label="t('timer.setup.moveBlockUp', { name: blockName(index) })"
                @click="emit('update:blocks', moveCircuitBlock(blocks, index, -1))"
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :disabled="index === blocks.length - 1"
                :aria-label="t('timer.setup.moveBlockDown', { name: blockName(index) })"
                @click="emit('update:blocks', moveCircuitBlock(blocks, index, 1))"
              >
                <ChevronDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :disabled="blocks.length <= 1"
                :aria-label="t('timer.setup.removeBlock', { name: blockName(index) })"
                @click="emit('update:blocks', removeCircuitBlock(blocks, index))"
              >
                <Trash2 />
              </Button>
            </div>
          </fieldset>
        </li>
      </ol>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="blocks.length >= MAX_CIRCUIT_BLOCKS"
          @click="emit('update:blocks', appendCircuitBlock(blocks, 'work'))"
        >
          {{ t('timer.setup.addWorkBlock') }}
        </Button>
        <Button
          type="button"
          variant="outline"
          :disabled="blocks.length >= MAX_CIRCUIT_BLOCKS"
          @click="emit('update:blocks', appendCircuitBlock(blocks, 'rest'))"
        >
          {{ t('timer.setup.addRestBlock') }}
        </Button>
      </div>
    </fieldset>

    <ValuePicker
      id="circuit-repeat"
      :model-value="repeat"
      :label="t('timer.setup.repeats')"
      :options="roundOptions(repeat)"
      :custom-label="t('timer.setup.customRounds')"
      @update:model-value="emit('update:repeat', $event ?? 1)"
    />
  </div>
</template>
