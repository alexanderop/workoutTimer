<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { humanizeSeconds } from '@/features/timer/labels'
import { intervalOptions, roundOptions } from '@/features/timer/setupForm'
import type { TimerSetupDraft } from '@/features/timer/setupForm'

const { draft } = defineProps<{ draft: TimerSetupDraft }>()
const emit = defineEmits<{ edit: [Partial<TimerSetupDraft>] }>()

const { t } = useI18n()
const formatTime = (seconds: number): string => humanizeSeconds(seconds, t)
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <TimePicker
      id="interval"
      :model-value="draft.intervalSeconds"
      :label="t('timer.setup.interval')"
      :options="intervalOptions(draft.intervalSeconds, formatTime)"
      :custom-label="t('timer.setup.customTime')"
      :minutes-label="t('timer.setup.minutes')"
      :seconds-label="t('timer.setup.seconds')"
      :min-seconds="5"
      :max-seconds="3600"
      @update:model-value="emit('edit', { intervalSeconds: $event ?? 0 })"
    />
    <ValuePicker
      id="emom-rounds"
      :model-value="draft.rounds"
      :label="t('timer.setup.rounds')"
      :options="roundOptions(draft.rounds)"
      :custom-label="t('timer.setup.customRounds')"
      @update:model-value="emit('edit', { rounds: $event ?? 1 })"
    />
  </div>
</template>
