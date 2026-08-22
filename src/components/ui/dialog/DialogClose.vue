<script setup lang="ts">
import type { DialogCloseProps } from 'reka-ui'
import { DialogClose } from 'reka-ui'
import type { VNode } from 'vue'

/**
 * Closes the nearest `<Dialog>`. It reads the open state from the provider,
 * not from a parent prop, so it works wherever the consumer puts it — in the
 * footer, pinned to a corner, or outside `<DialogContent>` entirely.
 */
const props = defineProps<DialogCloseProps>()

defineSlots<{
  default: () => VNode[]
}>()
</script>

<template>
  <DialogClose data-slot="dialog-close" v-bind="props">
    <slot />
  </DialogClose>
</template>
