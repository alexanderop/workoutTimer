<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import PwaInstallPrompt from '@/components/PwaInstallPrompt.vue'
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue'
import ToastViewport from '@/components/ToastViewport.vue'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import { useLocale } from '@/composables/useLocale'
import { useTheme } from '@/composables/useTheme'
import { NAV_ITEMS } from '@/router/navigation'
import type { NavItem } from '@/types/navigation'

const { t } = useI18n()

useTheme()
useLocale()
useKeyboardInset()

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
    </AppShell>
    <PwaUpdatePrompt />
    <PwaInstallPrompt />
    <ToastViewport />
  </div>
</template>
