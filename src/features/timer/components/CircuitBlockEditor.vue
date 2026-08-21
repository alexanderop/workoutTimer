<script setup lang="ts">
import { ChevronDown, ChevronUp, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CIRCUIT_BLOCK_KINDS, MAX_CIRCUIT_BLOCKS } from '@/features/timer/domain'
import { chipClass } from '@/features/timer/components/chip'
import DurationFields from '@/features/timer/components/DurationFields.vue'
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
function blockName(block: CircuitBlockDraft, index: number): string {
  const label = block.label.trim()
  return label === '' ? t('timer.setup.block', { index: index + 1 }) : label
}

function patch(index: number, change: Partial<CircuitBlockDraft>): void {
  emit('update:blocks', updateCircuitBlock(props.blocks, index, change))
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <fieldset class="min-w-0">
      <legend class="mb-3 text-sm font-medium">{{ t('timer.setup.blocks') }}</legend>
      <ol class="flex flex-col gap-3">
        <li v-for="(block, index) in blocks" :key="index">
          <fieldset class="rounded-xl bg-muted p-3">
            <legend class="sr-only">{{ blockName(block, index) }}</legend>
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
                v-for="kind in CIRCUIT_BLOCK_KINDS"
                :key="kind"
                type="button"
                :class="[chipClass(block.kind === kind), 'text-sm']"
                :aria-pressed="block.kind === kind"
                @click="patch(index, { kind })"
              >
                {{ t(`timer.setup.${kind}`) }}
              </button>
            </div>
            <div class="mt-2 flex items-end gap-2">
              <DurationFields
                :id="`block-${index}`"
                class="min-w-0 flex-1"
                :model-value="block.durationSeconds"
                :minutes-label="t('timer.setup.minutes')"
                :seconds-label="t('timer.setup.seconds')"
                @update:model-value="patch(index, { durationSeconds: $event })"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :disabled="index === 0"
                :aria-label="t('timer.setup.moveBlockUp', { name: blockName(block, index) })"
                @click="emit('update:blocks', moveCircuitBlock(blocks, index, -1))"
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :disabled="index === blocks.length - 1"
                :aria-label="t('timer.setup.moveBlockDown', { name: blockName(block, index) })"
                @click="emit('update:blocks', moveCircuitBlock(blocks, index, 1))"
              >
                <ChevronDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                :disabled="blocks.length <= 1"
                :aria-label="t('timer.setup.removeBlock', { name: blockName(block, index) })"
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
          v-for="kind in CIRCUIT_BLOCK_KINDS"
          :key="kind"
          type="button"
          variant="outline"
          :disabled="blocks.length >= MAX_CIRCUIT_BLOCKS"
          @click="emit('update:blocks', appendCircuitBlock(blocks, kind))"
        >
          {{ t(`timer.setup.addBlock.${kind}`) }}
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
