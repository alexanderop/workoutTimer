<script setup lang="ts">
import CircuitBlockEditor from '@/features/timer/components/CircuitBlockEditor.vue'
import type { TimerSetupDraft } from '@/features/timer/setupForm'

/**
 * The circuit mode's fields. A thin adapter rather than a second editor: the
 * block list is its own control with its own emits, and this is what puts it
 * on the same `draft` / `edit` contract as the four picker-based modes so the
 * screen can dispatch to all five through one map.
 */
const { draft } = defineProps<{ draft: TimerSetupDraft }>()
const emit = defineEmits<{ edit: [Partial<TimerSetupDraft>] }>()
</script>

<template>
  <CircuitBlockEditor
    :blocks="draft.blocks"
    :repeat="draft.repeat"
    @update:blocks="emit('edit', { blocks: $event })"
    @update:repeat="emit('edit', { repeat: $event })"
  />
</template>
