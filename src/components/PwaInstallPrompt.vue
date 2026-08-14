<script setup lang="ts">
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  dismissInstallHintAtom,
  installDialogOpenAtom,
  installDialogRequestedAtom,
  installPromptEffectAtom,
} from '@/state/install'
import { bannerVisibleAtom } from '@/state/pwa'

const InstallDialog = defineAsyncComponent(() => import('./PwaInstallDialog.vue'))

const { t } = useI18n()
// The shell always renders this component, so subscribing here is what puts
// the `beforeinstallprompt` / `appinstalled` listeners up for the app's life.
useAtomValue(() => installPromptEffectAtom)
const dismissHint = useAtomSet(() => dismissInstallHintAtom)
const bannerVisible = useAtomValue(() => bannerVisibleAtom)
const dialogRequested = useAtomValue(() => installDialogRequestedAtom)
const [dialogOpen, setDialogOpen] = useAtom(() => installDialogOpenAtom)
const setDialogRequested = useAtomSet(() => installDialogRequestedAtom)

function openDialog(): void {
  setDialogRequested(true)
  setDialogOpen(true)
}
</script>

<template>
  <div role="status" aria-live="polite" aria-atomic="true">
    <div
      v-if="bannerVisible"
      class="fixed inset-x-4 bottom-24 z-50 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg sm:right-6 sm:left-auto sm:max-w-sm"
    >
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium">{{ t('pwa.install.banner.title') }}</p>
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.banner.body') }}</p>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" @click="dismissHint()">
          {{ t('pwa.install.banner.later') }}
        </Button>
        <Button size="sm" @click="openDialog">
          {{ t('pwa.install.banner.action') }}
        </Button>
      </div>
    </div>
  </div>

  <InstallDialog v-if="dialogRequested" :open="dialogOpen" @update:open="setDialogOpen" />
</template>
