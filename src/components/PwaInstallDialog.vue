<script setup lang="ts">
import { Share, SquarePlus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInstallPrompt } from '@/composables/useInstallPrompt'

const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const { canPromptDirectly, platform, promptInstall } = useInstallPrompt()

async function handleInstall(): Promise<void> {
  const outcome = await promptInstall()
  if (outcome === 'accepted') open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('pwa.install.dialog.title') }}</DialogTitle>
        <DialogDescription>{{ t('pwa.install.dialog.description') }}</DialogDescription>
      </DialogHeader>

      <div v-if="canPromptDirectly" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.prompt') }}</p>
        <Button @click="handleInstall">{{ t('pwa.install.dialog.action') }}</Button>
      </div>

      <div v-else-if="platform === 'ios'" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.ios.intro') }}</p>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li class="flex items-center gap-2">
            <Share aria-hidden="true" />
            {{ t('pwa.install.dialog.ios.share') }}
          </li>
          <li class="flex items-center gap-2">
            <SquarePlus aria-hidden="true" />
            {{ t('pwa.install.dialog.ios.add') }}
          </li>
          <li>{{ t('pwa.install.dialog.ios.confirm') }}</li>
        </ol>
        <p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {{ t('pwa.install.dialog.ios.note') }}
        </p>
      </div>

      <div v-else-if="platform === 'android'" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.android.intro') }}</p>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{{ t('pwa.install.dialog.android.menu') }}</li>
          <li>{{ t('pwa.install.dialog.android.install') }}</li>
          <li>{{ t('pwa.install.dialog.android.confirm') }}</li>
        </ol>
      </div>

      <div v-else class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.other.intro') }}</p>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{{ t('pwa.install.dialog.other.menu') }}</li>
          <li>{{ t('pwa.install.dialog.other.confirm') }}</li>
        </ol>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline" class="w-full sm:w-auto">
            {{ t('common.buttons.close') }}
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
