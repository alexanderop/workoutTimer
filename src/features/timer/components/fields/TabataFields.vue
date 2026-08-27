<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { humanizeSeconds } from '@/features/timer/labels'
import { intervalOptions, restOptions, roundOptions } from '@/features/timer/setupForm'
import type { TimerSetupDraft } from '@/features/timer/setupForm'

const { draft } = defineProps<{ draft: TimerSetupDraft }>()
const emit = defineEmits<{ edit: [Partial<TimerSetupDraft>] }>()

const { t } = useI18n()
const formatTime = (seconds: number): string => humanizeSeconds(seconds, t)
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-3">
    <TimePicker
      id="work"
      :model-value="draft.workSeconds"
      :label="t('timer.setup.work')"
      :options="intervalOptions(draft.workSeconds, formatTime)"
      :custom-label="t('timer.setup.customTime')"
      :minutes-label="t('timer.setup.minutes')"
      :seconds-label="t('timer.setup.seconds')"
      :min-seconds="1"
      :max-seconds="3600"
      @update:model-value="emit('edit', { workSeconds: $event ?? 0 })"
    />
    <TimePicker
      id="rest"
      :model-value="draft.restSeconds"
      :label="t('timer.setup.rest')"
      :options="restOptions(draft.restSeconds, formatTime)"
      :custom-label="t('timer.setup.customTime')"
      :minutes-label="t('timer.setup.minutes')"
      :seconds-label="t('timer.setup.seconds')"
      :min-seconds="0"
      :max-seconds="3600"
      @update:model-value="emit('edit', { restSeconds: $event ?? 0 })"
    />
    <ValuePicker
      id="tabata-rounds"
      :model-value="draft.rounds"
      :label="t('timer.setup.rounds')"
      :options="roundOptions(draft.rounds)"
      :custom-label="t('timer.setup.customRounds')"
      @update:model-value="emit('edit', { rounds: $event ?? 1 })"
    />
  </div>
</template>
