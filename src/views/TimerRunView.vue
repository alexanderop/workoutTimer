<script setup lang="ts">
import { useAtomSet } from '@effect/atom-vue'
import { Pause, Play, Plus, Volume2, VolumeX, X } from '@lucide/vue'
import { Effect } from 'effect'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTimestamp } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useReportFailure } from '@/composables/useReportFailure'
import {
  addSessionRound,
  finishSession,
  markSessionRunning,
  pauseSession,
  resumeSession,
  sessionMutation,
  settingsMutation,
  type FinishReason,
  updateTimerSettings,
} from '@/db'
import TimerRing from '@/features/timer/components/TimerRing.vue'
import {
  capturesRoundSplits,
  deriveTimer,
  formatDuration,
  isActiveSession,
  isFinishedSession,
  SECOND_MS,
} from '@/features/timer/domain'
import { emitTimerCue, unlockTimerAudio } from '@/features/timer/useTimerFeedback'
import { useTimerLabels } from '@/features/timer/useTimerLabels'
import { useWakeLock } from '@/features/timer/useWakeLock'
import { RouteNames } from '@/router'
import { useSession, useTimerSettings } from '@/stores/timerData'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const runMutation = useAtomSet(() => sessionMutation, { mode: 'promise' })
const runSettingsMutation = useAtomSet(() => settingsMutation, { mode: 'promise' })
const reportFailure = useReportFailure('timer-run')
const { modeName } = useTimerLabels()
const session = useSession(() => String(route.params.id))
const { data: settings } = useTimerSettings()
const now = useTimestamp({ interval: 100 })

const derived = computed(() => (session.value ? deriveTimer(session.value, now.value) : undefined))
const mode = computed(() => session.value?.config.mode ?? 'amrap')
const displayTime = computed(() =>
  derived.value
    ? formatDuration(derived.value.primaryMs, derived.value.primaryMs <= 10 * SECOND_MS)
    : '00:00',
)
const canCaptureRound = computed(() => capturesRoundSplits(mode.value))
const keepAwake = computed(
  () =>
    settings.value.keepAwake &&
    session.value !== undefined &&
    isActiveSession(session.value.status),
)

useWakeLock(keepAwake)

/**
 * An AudioContext may only be created from a user gesture, and this screen is
 * reachable without passing through the setup screen that used to be the only
 * place we asked for one — "Resume timer" on the home screen, or a reload
 * straight onto this URL mid-workout. Without this the header would render the
 * sound-on icon over a timer that never makes a sound. The first gesture
 * anywhere on the page is enough, and one is all we need.
 */
onMounted(() => {
  const options = { once: true, passive: true } as const
  document.addEventListener('pointerdown', unlockTimerAudio, options)
  document.addEventListener('keydown', unlockTimerAudio, options)

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', unlockTimerAudio)
    document.removeEventListener('keydown', unlockTimerAudio)
  })
})

const transitionPending = ref(false)
const finishArmed = ref(false)
const cancelArmed = ref(false)
let finishTimeout: ReturnType<typeof setTimeout> | undefined
let cancelTimeout: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => {
  if (finishTimeout) clearTimeout(finishTimeout)
  if (cancelTimeout) clearTimeout(cancelTimeout)
})

const failed = reportFailure('update timer', t('timer.run.saveFailed'))

function persistCompletion(id: string, reason: FinishReason): Promise<boolean> {
  return runMutation(
    finishSession(id, reason).pipe(
      Effect.as(true),
      Effect.catchTag('Db.DatabaseError', (error) => failed(error).pipe(Effect.as(false))),
    ),
  ).then((saved) => saved === true)
}

watch([session, now], async ([current, currentNow]) => {
  if (!current || transitionPending.value) return
  if (current.status === 'countdown' && currentNow >= current.startedAt) {
    transitionPending.value = true
    await runMutation(
      markSessionRunning(current.id).pipe(Effect.catchTag('Db.DatabaseError', failed)),
    )
    transitionPending.value = false
    return
  }
  const state = deriveTimer(current, currentNow)
  if (!state.isComplete || isFinishedSession(current.status)) return
  transitionPending.value = true
  const reason = current.config.mode === 'forTime' ? 'timeCap' : 'endpoint'
  const saved = await runMutation(
    finishSession(current.id, reason).pipe(
      Effect.tap(() => Effect.sync(() => emitTimerCue(settings.value, 'complete'))),
      Effect.as(true),
      Effect.catchTag('Db.DatabaseError', (error) => failed(error).pipe(Effect.as(false))),
    ),
  )
  if (saved) {
    await router.replace({ name: RouteNames.timerResult, params: { id: current.id } })
  }
  transitionPending.value = false
})

let previousPhase: string | undefined
let previousCountdownSecond: number | undefined
watch(
  derived,
  (state) => {
    if (!state || state.phase === 'finished') return
    if (previousPhase !== undefined && previousPhase !== state.phase) {
      emitTimerCue(settings.value, 'phase')
    }
    previousPhase = state.phase
    const second = Math.ceil(state.primaryMs / SECOND_MS)
    if (second <= 3 && second > 0 && second !== previousCountdownSecond) {
      emitTimerCue(settings.value, 'countdown', String(second))
    }
    previousCountdownSecond = second
  },
  { immediate: true },
)

function phaseLabel(): string {
  if (session.value?.status === 'paused') return t('timer.run.paused')
  switch (derived.value?.phase) {
    case 'countdown':
      return t('timer.run.countdown')
    case 'rest':
      return t('timer.run.rest')
    default:
      return t('timer.run.work')
  }
}

async function togglePause(): Promise<void> {
  const current = session.value
  if (!current) return
  const program = current.status === 'paused' ? resumeSession(current.id) : pauseSession(current.id)
  await runMutation(program.pipe(Effect.catchTag('Db.DatabaseError', failed)))
}

async function addRound(): Promise<void> {
  const current = session.value
  const state = derived.value
  if (!current || !state) return
  await runMutation(
    addSessionRound(current.id, Math.round(state.elapsedMs)).pipe(
      // Only cue a split that was actually written. The repository declines a
      // round for a session that has already finished, and debounces a
      // double-tap into one — buzzing either way would confirm a split the
      // user does not have.
      Effect.tap((recorded) =>
        Effect.sync(() => {
          if (recorded) emitTimerCue(settings.value, 'round')
        }),
      ),
      Effect.catchTags({
        'Db.DatabaseError': failed,
        'Db.WorkoutInvalidError': failed,
      }),
    ),
  )
}

async function finish(): Promise<void> {
  const current = session.value
  if (!current) return
  if (!finishArmed.value) {
    finishArmed.value = true
    finishTimeout = setTimeout(() => {
      finishArmed.value = false
    }, 3_000)
    return
  }
  transitionPending.value = true
  const saved = await persistCompletion(current.id, 'manual')
  if (saved) {
    await router.replace({ name: RouteNames.timerResult, params: { id: current.id } })
  }
  transitionPending.value = false
}

async function cancel(): Promise<void> {
  const current = session.value
  if (!current) return
  if (!cancelArmed.value) {
    cancelArmed.value = true
    cancelTimeout = setTimeout(() => {
      cancelArmed.value = false
    }, 3_000)
    return
  }
  transitionPending.value = true
  const saved = await persistCompletion(current.id, 'cancelled')
  if (saved) {
    await router.replace({ name: RouteNames.timer })
  }
  transitionPending.value = false
}

function toggleSound(): Promise<unknown> {
  // Turning sound *on* is a gesture, and possibly the first one on this page —
  // take it as the cue to open the AudioContext so the next beep is audible.
  unlockTimerAudio()
  return runSettingsMutation(
    updateTimerSettings({ soundEnabled: !settings.value.soundEnabled }).pipe(
      Effect.catchTag('Db.DatabaseError', failed),
    ),
  )
}
</script>

<template>
  <div
    :data-mode="mode"
    class="flex min-h-full flex-col bg-neutral-950 text-white safe-area-bottom"
  >
    <header class="flex items-center justify-between gap-3 p-4">
      <Button
        variant="ghost"
        size="icon"
        class="text-white hover:bg-white/10 hover:text-white"
        :aria-label="cancelArmed ? t('timer.run.cancelConfirm') : t('timer.run.cancel')"
        @click="cancel"
      >
        <X />
      </Button>
      <h1 class="font-bold tracking-widest">{{ modeName(mode) }}</h1>
      <Button
        variant="ghost"
        size="icon"
        class="text-white hover:bg-white/10 hover:text-white"
        :aria-label="settings.soundEnabled ? t('timer.run.soundOn') : t('timer.run.soundOff')"
        @click="toggleSound"
      >
        <Volume2 v-if="settings.soundEnabled" />
        <VolumeX v-else />
      </Button>
    </header>

    <div v-if="!session || !derived" class="grid flex-1 place-items-center p-6 text-center">
      <p role="alert">{{ t('timer.run.missing') }}</p>
    </div>

    <main
      v-else
      class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 p-5"
    >
      <p v-if="derived.totalRounds" class="text-lg font-semibold text-white/75">
        {{ t('timer.run.round', { current: derived.round, total: derived.totalRounds }) }}
      </p>
      <p v-else class="text-lg font-semibold text-white/75">
        {{ t('timer.run.roundsCaptured', { count: derived.completedRounds }) }}
      </p>

      <TimerRing :progress="derived.progress">
        <p aria-live="polite" class="text-base font-bold tracking-[0.2em] text-white/70 uppercase">
          {{ phaseLabel() }}
        </p>
        <p
          class="mt-2 text-[clamp(3.5rem,18vw,7rem)] leading-none font-bold tracking-tight tabular-nums"
        >
          {{ displayTime }}
        </p>
      </TimerRing>

      <div class="grid w-full max-w-sm grid-cols-2 gap-3">
        <Button
          class="h-14 bg-white text-base text-black hover:bg-white/90"
          :disabled="derived.phase === 'countdown'"
          @click="togglePause"
        >
          <Play v-if="session.status === 'paused'" />
          <Pause v-else />
          {{ session.status === 'paused' ? t('timer.run.resume') : t('timer.run.pause') }}
        </Button>
        <Button
          v-if="canCaptureRound"
          class="h-14 bg-[var(--mode-color)] text-base text-[var(--mode-foreground)]"
          :disabled="derived.phase === 'countdown'"
          @click="addRound"
        >
          <Plus />
          {{ t('timer.run.addRound') }}
        </Button>
        <Button
          v-else
          variant="outline"
          class="h-14 border-white/30 bg-transparent text-base text-white hover:bg-white/10 hover:text-white"
          @click="finish"
        >
          {{ finishArmed ? t('timer.run.finishConfirm') : t('timer.run.finish') }}
        </Button>
      </div>

      <Button
        v-if="canCaptureRound"
        variant="ghost"
        class="text-white/70 hover:bg-white/10 hover:text-white"
        @click="finish"
      >
        {{ finishArmed ? t('timer.run.finishConfirm') : t('timer.run.finish') }}
      </Button>
    </main>
  </div>
</template>
