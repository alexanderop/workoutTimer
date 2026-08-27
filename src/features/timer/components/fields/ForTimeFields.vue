<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { humanizeSeconds } from '@/features/timer/labels'
import {
  durationOptions,
  MAX_TIMER_DURATION_SECONDS,
  roundOptions,
} from '@/features/timer/setupForm'
import type { TimerSetupDraft } from '@/features/timer/setupForm'

const { draft } = defineProps<{ draft: TimerSetupDraft }>()
const emit = defineEmits<{ edit: [Partial<TimerSetupDraft>] }>()

const { t } = useI18n()
const formatTime = (seconds: number): string => humanizeSeconds(seconds, t)
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <TimePicker
      id="time-cap"
      :model-value="draft.timeCapSeconds"
      :label="t('timer.setup.timeCap')"
      :options="durationOptions(draft.timeCapSeconds, formatTime)"
      :empty-label="t('timer.setup.noTimeCap')"
      :custom-label="t('timer.setup.customTime')"
      :minutes-label="t('timer.setup.minutes')"
      :seconds-label="t('timer.setup.seconds')"
      :min-seconds="1"
      :max-seconds="MAX_TIMER_DURATION_SECONDS"
      @update:model-value="emit('edit', { timeCapSeconds: $event })"
    />
    <ValuePicker
      id="target-rounds"
      :model-value="draft.targetRounds"
      :label="t('timer.setup.targetRounds')"
      :options="roundOptions(draft.targetRounds)"
      :empty-label="t('timer.setup.noTargetRounds')"
      :custom-label="t('timer.setup.customRounds')"
      @update:model-value="emit('edit', { targetRounds: $event })"
    />
  </div>
</template>
