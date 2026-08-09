<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { NavItem } from '@/types/navigation'

/**
 * Mobile app shell: fixed-height flex column with a scrollable main area and
 * a bottom tab bar. Navigation is config-driven — pass the tabs as `items`
 * (see src/router/navigation.ts). An optional #center-action slot renders a
 * floating action button between the two halves of the tab bar.
 *
 * Full-screen routes opt out of the tab bar with `meta: { hideNav: true }`.
 */
const { items } = defineProps<{
  items: ReadonlyArray<NavItem>
}>()

defineSlots<{
  default: () => unknown
  'center-action'?: () => unknown
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const slots = useSlots()

const hideNavigation = computed(() => route.meta.hideNav === true)
const hasCenterAction = computed(() => slots['center-action'] !== undefined)

// With a center action the tabs split around it; without one they form a
// plain tab bar and the right half stays empty.
const splitIndex = computed(() => Math.ceil(items.length / 2))
const leftItems = computed(() => (hasCenterAction.value ? items.slice(0, splitIndex.value) : items))
const rightItems = computed(() => (hasCenterAction.value ? items.slice(splitIndex.value) : []))

function isActive(routeName: string): boolean {
  return route.name === routeName
}

function navigate(routeName: string): void {
  void router.push({ name: routeName })
}
</script>

<template>
  <!-- The top and side insets go on the shell root, not on <main>. A sticky
       element's constraint rectangle is the scrollport — the scroll
       container's padding box — so padding-top on <main> would *not* push
       PageHeader's `sticky top-0` down; the header would stick flush to the
       top of <main> and slide under the status bar, which is the bug. One
       declaration here is correct with or without a sticky header, correct
       for both view styles, and cannot be double-paid. `bg-background`
       paints under padding, so the status-bar strip is filled. -->
  <div class="flex h-dvh flex-col bg-background safe-area-top safe-area-x">
    <!-- `overscroll-contain`, not `none`: chaining out of the scroller is the
         "this is a website" tell, but rubber-banding belongs to the element
         that legitimately scrolls. The `overscroll-behavior-y: none` on body
         (src/style.css) is the outer guard and does not cover this — body
         never scrolls, because the shell is an h-dvh column. -->
    <main
      class="flex-1 overflow-y-auto overscroll-contain"
      :class="hideNavigation && 'safe-area-bottom'"
    >
      <slot />
    </main>

    <!-- No `sticky bottom-0`: this is a non-flexing sibling in a non-scrolling
         h-dvh column, so there is no scrollport for it to stick against. The
         class read as load-bearing and was inert. With `meta.hideNav` the nav
         does not render at all, which is why <main> pays the bottom inset in
         that case. -->
    <nav
      v-if="!hideNavigation"
      :aria-label="t('nav.ariaLabel')"
      class="border-t bg-card safe-area-bottom"
    >
      <div class="flex justify-around">
        <button
          v-for="item in leftItems"
          :key="item.routeName"
          type="button"
          class="flex min-h-touch-target flex-1 flex-col items-center justify-center px-2 py-3 select-none touch-manipulation transition-[color,scale] duration-100 active:scale-90"
          :class="
            isActive(item.routeName)
              ? 'border-t-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-current="isActive(item.routeName) ? 'page' : undefined"
          @click="navigate(item.routeName)"
        >
          <component :is="item.icon" :size="24" class="mb-1" aria-hidden="true" />
          <span class="text-xs font-medium">{{ item.label }}</span>
        </button>

        <slot name="center-action" />

        <button
          v-for="item in rightItems"
          :key="item.routeName"
          type="button"
          class="flex min-h-touch-target flex-1 flex-col items-center justify-center px-2 py-3 select-none touch-manipulation transition-[color,scale] duration-100 active:scale-90"
          :class="
            isActive(item.routeName)
              ? 'border-t-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-current="isActive(item.routeName) ? 'page' : undefined"
          @click="navigate(item.routeName)"
        >
          <component :is="item.icon" :size="24" class="mb-1" aria-hidden="true" />
          <span class="text-xs font-medium">{{ item.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>
