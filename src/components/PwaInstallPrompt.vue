<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

const InstallDialog = defineAsyncComponent(() => import('./PwaInstallDialog.vue'))

const { t } = useI18n()
const { hintVisible, dismissHint } = useInstallPrompt()
const { needRefresh } = usePwaUpdate()
const dialogOpen = ref(false)
const dialogRequested = ref(false)

// Both banners occupy the same space. An available update takes priority.
const bannerVisible = computed(() => hintVisible.value && !needRefresh.value)

function openDialog(): void {
  dialogRequested.value = true
  dialogOpen.value = true
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
        <Button variant="ghost" size="sm" @click="dismissHint">
          {{ t('pwa.install.banner.later') }}
        </Button>
        <Button size="sm" @click="openDialog">
          {{ t('pwa.install.banner.action') }}
        </Button>
      </div>
    </div>
  </div>

  <InstallDialog v-if="dialogRequested" v-model:open="dialogOpen" />
</template>
