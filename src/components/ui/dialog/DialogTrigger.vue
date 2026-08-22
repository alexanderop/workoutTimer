<script setup lang="ts">
import type { DialogTriggerProps } from 'reka-ui'
import { DialogTrigger } from 'reka-ui'
import type { VNode } from 'vue'

/**
 * No `class` prop and no `cn()`: this part sets no classes of its own, so
 * Vue's attribute fallthrough already merges whatever the consumer passes.
 * Pass `as-child` to hand the behaviour to your own element instead.
 */
const props = defineProps<DialogTriggerProps>()

defineSlots<{
  default: () => VNode[]
}>()
</script>

<template>
  <DialogTrigger data-slot="dialog-trigger" v-bind="props">
    <slot />
  </DialogTrigger>
</template>
