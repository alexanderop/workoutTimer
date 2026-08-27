<script setup lang="ts">
import type { NavItem } from '@/types/navigation'

/**
 * One tab in the bottom bar.
 *
 * Its own component because the shell renders the tabs in two halves — the
 * ones left of the centre action and the ones right of it — and both halves
 * were the same fifteen lines of markup, including the `aria-current` and the
 * press state that had to be kept in step by hand.
 *
 * `active` is a prop rather than a route comparison here: which tab is current
 * is the shell's question, and asking it once beats asking it per tab.
 */
defineProps<{
  item: NavItem
  active: boolean
}>()

defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex min-h-touch-target flex-1 flex-col items-center justify-center px-2 py-3 transition-[color,scale] duration-100 select-none touch-manipulation active:scale-90"
    :class="
      active
        ? 'border-t-2 border-primary text-primary'
        : 'text-muted-foreground hover:text-foreground'
    "
    :aria-current="active ? 'page' : undefined"
    @click="$emit('select')"
  >
    <component :is="item.icon" :size="24" class="mb-1" aria-hidden="true" />
    <span class="text-xs font-medium">{{ item.label }}</span>
  </button>
</template>
