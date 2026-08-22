<script setup lang="ts">
import type { VNode } from 'vue'
import PageHeader from '@/components/PageHeader.vue'

const {
  title,
  subtitle,
  backTo,
  showBack = true,
  scrollable = true,
  preventNavigation = false,
} = defineProps<{
  title: string
  subtitle?: string
  backTo?: string
  showBack?: boolean
  scrollable?: boolean
  preventNavigation?: boolean
}>()

const emit = defineEmits<{
  back: []
}>()

defineSlots<{
  'header-actions'?: () => VNode[]
  default: () => VNode[]
  footer?: () => VNode[]
}>()
</script>

<template>
  <div class="flex h-full flex-col">
    <PageHeader
      :title="title"
      :subtitle="subtitle"
      :back-to="backTo"
      :show-back="showBack"
      :prevent-navigation="preventNavigation"
      @back="emit('back')"
    >
      <template #actions>
        <slot name="header-actions" />
      </template>
    </PageHeader>

    <div
      class="flex-1"
      :class="scrollable ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'"
    >
      <slot />
    </div>

    <footer v-if="$slots.footer" class="sticky bottom-0 border-t bg-background">
      <slot name="footer" />
    </footer>
  </div>
</template>
