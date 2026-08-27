<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import { humanizeSeconds } from '@/features/timer/labels'
import { durationOptions, MAX_TIMER_DURATION_SECONDS } from '@/features/timer/setupForm'
import type { TimerSetupDraft } from '@/features/timer/setupForm'

const { draft } = defineProps<{ draft: TimerSetupDraft }>()
const emit = defineEmits<{ edit: [Partial<TimerSetupDraft>] }>()

const { t } = useI18n()
const formatTime = (seconds: number): string => humanizeSeconds(seconds, t)
</script>

<template>
  <div>
    <TimePicker
      id="duration"
      :model-value="draft.durationSeconds"
      :label="t('timer.setup.duration')"
      :options="durationOptions(draft.durationSeconds, formatTime)"
      :custom-label="t('timer.setup.customTime')"
      :minutes-label="t('timer.setup.minutes')"
      :seconds-label="t('timer.setup.seconds')"
      :min-seconds="1"
      :max-seconds="MAX_TIMER_DURATION_SECONDS"
      @update:model-value="emit('edit', { durationSeconds: $event ?? 0 })"
    />
  </div>
</template>
