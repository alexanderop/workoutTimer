<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue'
import ToastViewport from '@/components/ToastViewport.vue'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import { useLocale } from '@/composables/useLocale'
import { useTheme } from '@/composables/useTheme'
import { NAV_ITEMS } from '@/router/navigation'
import { useQuickAddStore } from '@/stores/quickAdd'
import type { NavItem } from '@/types/navigation'

// Loaded on first use so the quick-add machinery stays off the startup path.
const QuickAddNoteSheet = defineAsyncComponent(
  () => import('@/features/notes/components/QuickAddNoteSheet.vue'),
)

const { t } = useI18n()

useTheme()
useLocale()
useKeyboardInset()

const quickAdd = useQuickAddStore()

const navItems = computed<Array<NavItem>>(() =>
  NAV_ITEMS.map((item) => ({
    routeName: item.routeName,
    icon: item.icon,
    label: t(item.labelKey),
  })),
)
</script>

<template>
  <div data-testid="app" class="h-full">
    <AppShell :items="navItems">
      <RouterView />

      <template #center-action>
        <button
          type="button"
          class="flex flex-1 flex-col items-center justify-center px-2 py-2"
          :aria-label="t('quickAdd.open')"
          @click="quickAdd.open()"
        >
          <span
            class="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
          >
            <Plus :size="26" aria-hidden="true" />
          </span>
        </button>
      </template>
    </AppShell>

    <QuickAddNoteSheet v-if="quickAdd.hasOpened" v-model:open="quickAdd.isOpen" />
    <PwaUpdatePrompt />
    <ToastViewport />
  </div>
</template>
