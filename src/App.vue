<script setup lang="ts">
import { useAtomValue } from '@effect/atom-vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import PwaInstallPrompt from '@/components/PwaInstallPrompt.vue'
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue'
import ToastViewport from '@/components/ToastViewport.vue'
import { navItems } from '@/router/navigation'
import { keyboardInsetEffectAtom } from '@/state/keyboard'
import { localeEffectAtom } from '@/state/locale'
import { themeEffectAtom } from '@/state/theme'

const { t } = useI18n()

// Subscribing is what starts a side-effect atom, and the shell is mounted for
// the app's lifetime — so this is where the theme class, the `<html lang>` and
// the `--keyboard-inset` variable get their owner. No composable in between:
// `useAtomValue` is the bridge.
useAtomValue(() => themeEffectAtom)
useAtomValue(() => localeEffectAtom)
useAtomValue(() => keyboardInsetEffectAtom)

// A function, not a `computed`: the labels are translations, so the only
// dependency is the active locale, and reading it during render is what makes
// the shell re-render when the language changes.
const tabs = () => navItems(t)
</script>

<template>
  <div data-testid="app" class="h-full">
    <AppShell :items="tabs()">
      <RouterView />
    </AppShell>
    <PwaUpdatePrompt />
    <PwaInstallPrompt />
    <ToastViewport />
  </div>
</template>
