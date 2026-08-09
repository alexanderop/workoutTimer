<script setup lang="ts">
import { useAtomSet } from '@effect/atom-vue'
import { Download, Smartphone, Upload } from '@lucide/vue'
import { Effect } from 'effect'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageLayout from '@/components/PageLayout.vue'
import PwaInstallDialog from '@/components/PwaInstallDialog.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { useLocale } from '@/composables/useLocale'
import { useReportFailure } from '@/composables/useReportFailure'
import { useTheme } from '@/composables/useTheme'
import {
  exportData,
  importData,
  restoreMutation,
  runDb,
  settingsMutation,
  START_COUNTDOWN_OPTIONS,
  type StartCountdownMs,
  type TimerSettings,
  updateTimerSettings,
} from '@/db'
import { emitTimerCue, unlockTimerAudio } from '@/features/timer/useTimerFeedback'
import type { SupportedLocale } from '@/i18n'
import { downloadBackup, readBackupFile } from '@/lib/backupFile'
import { useTimerSettings } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const { isDark } = useTheme()
const { locale, setLocale, supportedLocales } = useLocale()
const { canInstall, isInstalled } = useInstallPrompt()
const toast = useToastStore()
const installDialogOpen = ref(false)
const runSettingsMutation = useAtomSet(() => settingsMutation, { mode: 'promise' })
const runRestoreMutation = useAtomSet(() => restoreMutation, { mode: 'promise' })
const reportFailure = useReportFailure('settings')
const { data: settings } = useTimerSettings()

function localeName(code: SupportedLocale): string {
  return t('settings.language.nativeName', {}, { locale: code })
}

function handleLocaleChange(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as SupportedLocale)
}

function saveSetting(patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>): Promise<unknown> {
  return runSettingsMutation(
    updateTimerSettings(patch).pipe(
      Effect.catchTag(
        'Db.DatabaseError',
        reportFailure('save timer preference', t('settings.timer.saveFailed')),
      ),
    ),
  )
}

function handleVolumeChange(event: Event): Promise<unknown> {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value < 0 || value > 100) return Promise.resolve()
  const soundVolume = value / 100
  // Play the round cue at the new level so the user hears what they picked.
  // Haptics and speech are muted for the preview — only the volume is on trial.
  unlockTimerAudio()
  emitTimerCue(
    { ...settings.value, soundVolume, hapticsEnabled: false, spokenCountdownEnabled: false },
    'round',
  )
  return saveSetting({ soundVolume })
}

/**
 * A `<select>` hands back a string, and a stale service worker can serve a
 * template offering a length this build no longer accepts — so the value is
 * matched against the schema's own list rather than cast to it.
 */
function toStartCountdown(value: string): StartCountdownMs | undefined {
  return START_COUNTDOWN_OPTIONS.find((option) => String(option) === value)
}

function handleCountdownChange(event: Event): Promise<unknown> {
  const startCountdownMs = toStartCountdown((event.target as HTMLSelectElement).value)
  if (startCountdownMs === undefined) return Promise.resolve()

  return saveSetting({ startCountdownMs })
}

function countdownLabel(milliseconds: StartCountdownMs): string {
  return milliseconds === 0
    ? t('settings.timer.countdownOff')
    : t('settings.timer.countdownSeconds', { count: milliseconds / 1_000 })
}

function handleExport(): Promise<void> {
  const failed = reportFailure('export backup', t('settings.data.exportError'))
  return runDb(
    exportData.pipe(
      Effect.flatMap(downloadBackup),
      Effect.catchTags({ 'Db.DatabaseError': failed, 'BackupFile.BackupFileError': failed }),
    ),
  )
}

const fileInput = ref<HTMLInputElement | null>(null)

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const failed = reportFailure('import backup', t('settings.data.importError'))
  await runRestoreMutation(
    readBackupFile(file).pipe(
      Effect.flatMap(importData),
      Effect.tap(() => Effect.sync(() => toast.showToast(t('settings.data.importSuccess')))),
      Effect.catchTags({
        'Db.BackupInvalidError': reportFailure('import backup', t('settings.data.invalidBackup')),
        'BackupFile.BackupFileError': failed,
        'Db.DatabaseError': failed,
      }),
    ),
  )
}
</script>

<template>
  <PageLayout :title="t('settings.title')" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.appearance.title') }}</h2>
        <div class="flex min-h-touch-target items-center justify-between rounded-xl border p-4">
          <Label for="dark-mode-switch">{{ t('settings.appearance.darkMode') }}</Label>
          <Switch id="dark-mode-switch" v-model="isDark" />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.timer.title') }}</h2>
        <div class="divide-y rounded-xl border">
          <label
            class="flex min-h-touch-target items-center justify-between gap-4 p-4"
            for="sound-switch"
          >
            <span>{{ t('settings.timer.sound') }}</span>
            <Switch
              id="sound-switch"
              :model-value="settings.soundEnabled"
              @update:model-value="saveSetting({ soundEnabled: $event })"
            />
          </label>
          <label class="flex flex-col gap-2 p-4 text-sm font-medium" for="sound-volume">
            <span class="flex items-center justify-between">
              <span>{{ t('settings.timer.soundVolume') }}</span>
              <span class="font-normal text-muted-foreground">
                {{ Math.round(settings.soundVolume * 100) }}%
              </span>
            </span>
            <input
              id="sound-volume"
              type="range"
              min="0"
              max="100"
              step="10"
              class="h-touch-target w-full accent-primary"
              :value="Math.round(settings.soundVolume * 100)"
              :disabled="!settings.soundEnabled"
              @change="handleVolumeChange"
            />
          </label>
          <label
            class="flex min-h-touch-target items-center justify-between gap-4 p-4"
            for="haptics-switch"
          >
            <span>{{ t('settings.timer.haptics') }}</span>
            <Switch
              id="haptics-switch"
              :model-value="settings.hapticsEnabled"
              @update:model-value="saveSetting({ hapticsEnabled: $event })"
            />
          </label>
          <label
            class="flex min-h-touch-target items-center justify-between gap-4 p-4"
            for="spoken-switch"
          >
            <span>{{ t('settings.timer.spokenCountdown') }}</span>
            <Switch
              id="spoken-switch"
              :model-value="settings.spokenCountdownEnabled"
              @update:model-value="saveSetting({ spokenCountdownEnabled: $event })"
            />
          </label>
          <label
            class="flex min-h-touch-target items-center justify-between gap-4 p-4"
            for="wake-switch"
          >
            <span>{{ t('settings.timer.keepAwake') }}</span>
            <Switch
              id="wake-switch"
              :model-value="settings.keepAwake"
              @update:model-value="saveSetting({ keepAwake: $event })"
            />
          </label>
          <label class="flex flex-col gap-2 p-4 text-sm font-medium" for="start-countdown">
            {{ t('settings.timer.startCountdown') }}
            <select
              id="start-countdown"
              class="h-touch-target rounded-md border bg-transparent px-3 text-base"
              :value="settings.startCountdownMs"
              @change="handleCountdownChange"
            >
              <option v-for="option in START_COUNTDOWN_OPTIONS" :key="option" :value="option">
                {{ countdownLabel(option) }}
              </option>
            </select>
          </label>
        </div>
        <p class="text-sm text-muted-foreground">{{ t('settings.timer.capabilityNote') }}</p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.language.title') }}</h2>
        <div class="rounded-xl border p-4">
          <label class="flex flex-col gap-2 text-sm font-medium" for="locale-select">
            {{ t('settings.language.label') }}
            <select
              id="locale-select"
              class="h-touch-target rounded-md border bg-transparent px-3 text-base"
              :value="locale"
              @change="handleLocaleChange"
            >
              <option v-for="code in supportedLocales" :key="code" :value="code">
                {{ localeName(code) }}
              </option>
            </select>
          </label>
        </div>
      </section>

      <section v-if="canInstall || isInstalled" class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('pwa.install.settings.title') }}</h2>
        <div class="flex flex-col gap-4 rounded-xl border p-4">
          <p v-if="isInstalled" class="text-sm text-muted-foreground">
            {{ t('pwa.install.settings.installed') }}
          </p>
          <template v-else>
            <p class="text-sm text-muted-foreground">
              {{ t('pwa.install.settings.description') }}
            </p>
            <div>
              <Button variant="outline" @click="installDialogOpen = true">
                <Smartphone />
                {{ t('pwa.install.settings.action') }}
              </Button>
            </div>
          </template>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.data.title') }}</h2>
        <div class="flex flex-col gap-4 rounded-xl border p-4">
          <p class="text-sm text-muted-foreground">{{ t('settings.data.description') }}</p>
          <p class="text-sm text-muted-foreground">{{ t('settings.data.importWarning') }}</p>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" @click="handleExport"
              ><Download />{{ t('settings.data.export') }}</Button
            >
            <Button variant="outline" @click="fileInput?.click()"
              ><Upload />{{ t('settings.data.import') }}</Button
            >
            <input
              ref="fileInput"
              type="file"
              accept="application/json"
              class="hidden"
              @change="handleImportFile"
            />
          </div>
        </div>
      </section>
    </div>

    <PwaInstallDialog v-model:open="installDialogOpen" />
  </PageLayout>
</template>
