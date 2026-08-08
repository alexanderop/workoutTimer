<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Download, Upload } from '@lucide/vue'
import { Effect } from 'effect'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLocale } from '@/composables/useLocale'
import { useReportFailure } from '@/composables/useReportFailure'
import { useTheme } from '@/composables/useTheme'
import {
  exportData,
  importData,
  restoreMutation,
  runDb,
  settingsMutation,
  type TimerSettings,
  updateTimerSettings,
} from '@/db'
import type { SupportedLocale } from '@/i18n'
import { downloadBackup, readBackupFile } from '@/lib/backupFile'
import { timerSettingsAtom } from '@/stores/timerData'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const { isDark } = useTheme()
const { locale, setLocale, supportedLocales } = useLocale()
const toast = useToastStore()
const runSettingsMutation = useAtomSet(() => settingsMutation, { mode: 'promise' })
const runRestoreMutation = useAtomSet(() => restoreMutation, { mode: 'promise' })
const reportFailure = useReportFailure('settings')
const settingsResult = useAtomValue(() => timerSettingsAtom)
const fallbackSettings: TimerSettings = {
  id: 'timer',
  soundEnabled: true,
  hapticsEnabled: true,
  spokenCountdownEnabled: false,
  startCountdownMs: 3_000,
  keepAwake: true,
  updatedAt: 0,
}
const settings = computed(() => AsyncResult.getOrElse(settingsResult.value, () => fallbackSettings))

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

function handleCountdownChange(event: Event): Promise<unknown> {
  const value = Number((event.target as HTMLSelectElement).value)
  if (![0, 3_000, 5_000, 10_000].includes(value)) return Promise.resolve()
  return saveSetting({ startCountdownMs: value as 0 | 3_000 | 5_000 | 10_000 })
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
              <option :value="0">{{ t('settings.timer.countdownOff') }}</option>
              <option :value="3000">
                {{ t('settings.timer.countdownSeconds', { count: 3 }) }}
              </option>
              <option :value="5000">
                {{ t('settings.timer.countdownSeconds', { count: 5 }) }}
              </option>
              <option :value="10000">
                {{ t('settings.timer.countdownSeconds', { count: 10 }) }}
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
  </PageLayout>
</template>
