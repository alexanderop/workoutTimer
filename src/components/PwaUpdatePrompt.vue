<script setup lang="ts">
import { useAtom, useAtomSet } from '@effect/atom-vue'
import { X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { needRefreshAtom, reloadRequestedAtom } from '@/state/swUpdate'

/**
 * "Update available" banner for the prompt-style service worker flow.
 * Sits above the bottom navigation so it never covers the tabs.
 */
const { t } = useI18n()
const [needRefresh, setNeedRefresh] = useAtom(() => needRefreshAtom)
const requestReload = useAtomSet(() => reloadRequestedAtom)
</script>

<template>
  <!-- The live region stays mounted so screen readers are already observing it
       when the banner appears; a region created together with its content is
       not announced. Same pattern as ToastViewport.vue. -->
  <div role="status" aria-live="polite" aria-atomic="true">
    <div
      v-if="needRefresh"
      class="fixed inset-x-4 bottom-24 z-50 flex items-center gap-2 rounded-lg border bg-card p-3 shadow-lg sm:right-6 sm:left-auto sm:max-w-sm"
    >
      <p class="flex-1 text-sm">{{ t('pwa.updateAvailable') }}</p>
      <Button size="sm" @click="requestReload(true)">{{ t('pwa.reload') }}</Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('pwa.dismiss')"
        @click="setNeedRefresh(false)"
      >
        <X />
      </Button>
    </div>
  </div>
</template>
