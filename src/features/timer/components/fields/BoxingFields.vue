<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BOXING_CALLOUTS, BOXING_PACES_MS } from '@/db'
import { chipClass } from '@/features/timer/components/chip'
import TimePicker from '@/features/timer/components/TimePicker.vue'
import ValuePicker from '@/features/timer/components/ValuePicker.vue'
import { boxingThemeAt, SECOND_MS } from '@/features/timer/domain'
import { humanizeSeconds, themeHint, themeName } from '@/features/timer/labels'
import {
  BOXING_PROGRAM_NAMES,
  boxingProgramOf,
  boxingProgramPatch,
  intervalOptions,
  restOptions,
  roundOptions,
} from '@/features/timer/setupForm'
import type { TimerSetupDraft } from '@/features/timer/setupForm'

const { draft } = defineProps<{ draft: TimerSetupDraft }>()
const emit = defineEmits<{ edit: [Partial<TimerSetupDraft>] }>()

const { t } = useI18n()
const formatTime = (seconds: number): string => humanizeSeconds(seconds, t)
const paces = BOXING_PACES_MS.map((pace) => pace / SECOND_MS)
const programs = ['freestyle', ...BOXING_PROGRAM_NAMES] as const
/** Long enough for any real session; a 999-round draft should not render 999 rows. */
const PLAN_ROWS = 15
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-3">
    <fieldset class="min-w-0 sm:col-span-3">
      <legend class="mb-3 text-sm font-medium">{{ t('timer.setup.program') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="program in programs"
          :key="program"
          type="button"
          :class="chipClass(boxingProgramOf(draft.themes) === program)"
          :aria-pressed="boxingProgramOf(draft.themes) === program"
          @click="emit('edit', boxingProgramPatch(program))"
        >
          {{ t(`timer.setup.programs.${program}`) }}
        </button>
      </div>
    </fieldset>
    <TimePicker
      id="work"
      :model-value="draft.workSeconds"
      :label="t('timer.setup.roundLength')"
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
      id="boxing-rounds"
      :model-value="draft.rounds"
      :label="t('timer.setup.rounds')"
      :options="roundOptions(draft.rounds)"
      :custom-label="t('timer.setup.customRounds')"
      @update:model-value="emit('edit', { rounds: $event ?? 1 })"
    />
    <fieldset class="min-w-0 sm:col-span-3">
      <legend class="mb-3 text-sm font-medium">{{ t('timer.setup.callouts') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="level in BOXING_CALLOUTS"
          :key="level"
          type="button"
          :class="chipClass(draft.callouts === level)"
          :aria-pressed="draft.callouts === level"
          @click="emit('edit', { callouts: level })"
        >
          {{ t(`timer.setup.calloutLevels.${level}`) }}
        </button>
      </div>
    </fieldset>
    <fieldset v-if="draft.callouts !== 'off'" class="min-w-0 sm:col-span-3">
      <legend class="mb-3 text-sm font-medium">{{ t('timer.setup.pace') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="pace in paces"
          :key="pace"
          type="button"
          :class="chipClass(draft.paceSeconds === pace)"
          :aria-pressed="draft.paceSeconds === pace"
          @click="emit('edit', { paceSeconds: pace })"
        >
          {{ t('timer.setup.paceEvery', { count: pace }) }}
        </button>
      </div>
    </fieldset>
    <section
      v-if="draft.themes.length > 0"
      class="sm:col-span-3"
      :aria-label="t('timer.setup.plan')"
    >
      <h3 class="mb-3 text-sm font-medium">{{ t('timer.setup.plan') }}</h3>
      <ol class="divide-y rounded-xl border">
        <li
          v-for="round in Math.min(draft.rounds, PLAN_ROWS)"
          :key="round"
          class="flex items-baseline gap-3 px-3 py-2.5"
        >
          <span class="w-5 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
            {{ round }}
          </span>
          <span class="min-w-0">
            <span class="block font-semibold">
              {{ themeName(boxingThemeAt(draft.themes, round) ?? 'combos', t) }}
            </span>
            <span class="block text-sm text-muted-foreground">
              {{ themeHint(boxingThemeAt(draft.themes, round) ?? 'combos', t) }}
            </span>
          </span>
        </li>
      </ol>
    </section>
  </div>
</template>
