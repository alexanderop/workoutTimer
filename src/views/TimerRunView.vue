<script setup lang="ts">
import { injectRegistry, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Pause, Play, Plus, Volume2, VolumeX, X } from '@lucide/vue'
import { Effect } from 'effect'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  addSessionRound,
  finishSession,
  pauseSession,
  resumeSession,
  sessionMutation,
  settingsMutation,
  type FinishReason,
  updateTimerSettings,
} from '@/db'
import { currentSessionAtom, runCallAtom, runDerivedTimerAtom } from '@/features/timer/atoms'
import { audioUnlockEffectAtom } from '@/features/timer/audioUnlock'
import TimerRing from '@/features/timer/components/TimerRing.vue'
import { capturesRoundSplits, formatDuration, SECOND_MS } from '@/features/timer/domain'
import { modeName, runPhaseName, themeHint, themeName } from '@/features/timer/labels'
import { timerCueAtom, timerRunDriverAtom } from '@/features/timer/runDriver'
import { emitTimerCue, unlockTimerAudio } from '@/features/timer/timerFeedback'
import { callSteps } from '@/features/timer/voiceCues'
import { wakeLockEffectAtom } from '@/features/timer/wakeLock'
import { failureReporter } from '@/lib/reportFailure'
import { RouteNames } from '@/router/routeNames'
import { armedConfirmationAtom, requestConfirmationIn } from '@/state/confirmation'
import { timerSettingsValueAtom } from '@/state/timerData'
import { showToastAtom } from '@/state/toast'
import type { TimerMode } from '@/db'
import type { RouteLocationRaw } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const runMutation = useAtomSet(() => sessionMutation, { mode: 'promise' })
const runSettingsMutation = useAtomSet(() => settingsMutation, { mode: 'promise' })
const registry = injectRegistry()
const showToast = useAtomSet(() => showToastAtom)
const reportFailure = failureReporter('timer-run', showToast)

const session = useAtomValue(() => currentSessionAtom)
const settings = useAtomValue(() => timerSettingsValueAtom)
const derived = useAtomValue(() => runDerivedTimerAtom)
const call = useAtomValue(() => runCallAtom)

// Subscribing is what starts them: the transition machine, the audio cues, the
// wake lock and the first-gesture audio unlock all live in atoms and run only
// while this screen is mounted.
useAtomValue(() => timerRunDriverAtom)
useAtomValue(() => timerCueAtom)
useAtomValue(() => wakeLockEffectAtom)
useAtomValue(() => audioUnlockEffectAtom)

const mode = (): TimerMode => session.value?.config.mode ?? 'amrap'
const displayTime = (): string =>
  derived.value
    ? formatDuration(derived.value.primaryMs, derived.value.primaryMs <= 10 * SECOND_MS)
    : '00:00'
const canCaptureRound = (): boolean => capturesRoundSplits(mode())

// Read as well as write: the Finish and Cancel labels change while armed,
// and the subscription is what gives the 3 s expiry a registry to write to.
const armedKey = useAtomValue(() => armedConfirmationAtom('timer-run'))

const failed = reportFailure('update timer', t('timer.run.saveFailed'))

/**
 * End the workout and go where that leaves the user — with the navigation
 * composed *into* the program rather than gated on the awaited promise.
 *
 * `mode: 'promise'` resolves the mutation atom's single `AsyncResult` slot, not
 * this call: `sessionMutation` is built `concurrent: true` (`src/db/atoms.ts`)
 * and shared with the run driver, so two writes in flight settle together, on
 * the value of whichever fiber started first. Reading a `true`/`false` back out
 * of it meant a Finish tap landing while the driver retried `markSessionRunning`
 * saw the driver's value, concluded the write had failed, and stayed on the
 * screen with the workout already finished on disk. A `tap` inside the program
 * cannot be about anyone else's call.
 */
function persistCompletion(
  id: string,
  reason: FinishReason,
  destination: RouteLocationRaw,
): Promise<void> {
  return runMutation(
    finishSession(id, reason).pipe(
      Effect.tap(() => Effect.sync(() => void router.replace(destination))),
      Effect.catchTag('Db.DatabaseError', failed),
    ),
  )
}

const phaseLabel = (): string => runPhaseName(session.value?.status, derived.value, t)

const currentModeName = (): string => modeName(mode(), t)

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
  if (!requestConfirmationIn(registry, 'timer-run', 'finish')) return
  await persistCompletion(current.id, 'manual', {
    name: RouteNames.timerResult,
    params: { id: current.id },
  })
}

async function cancel(): Promise<void> {
  const current = session.value
  if (!current) return
  if (!requestConfirmationIn(registry, 'timer-run', 'cancel')) return
  await persistCompletion(current.id, 'cancelled', { name: RouteNames.timer })
}

function toggleSound(): Promise<void> {
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
    :data-mode="mode()"
    class="flex min-h-full flex-col bg-neutral-950 text-white safe-area-bottom"
  >
    <header class="flex items-center justify-between gap-3 p-4">
      <Button
        variant="ghost"
        size="icon"
        class="text-white hover:bg-white/10 hover:text-white"
        :aria-label="armedKey === 'cancel' ? t('timer.run.cancelConfirm') : t('timer.run.cancel')"
        @click="cancel"
      >
        <X />
      </Button>
      <h1 class="font-bold tracking-widest">{{ currentModeName() }}</h1>
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
          {{ displayTime() }}
        </p>
      </TimerRing>

      <!--
        Between rounds is the only time anyone reads this screen — mid-round
        the athlete has gloves up and hears the coach instead. So the break
        says where they are and what the next round asks for.
      -->
      <section
        v-if="derived.upNext"
        class="w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 p-4 text-center"
        aria-live="polite"
      >
        <p class="text-xs font-bold tracking-[0.2em] text-white/60 uppercase">
          {{ t('timer.run.upNext') }} ·
          {{ t('timer.run.round', { current: derived.upNext.round, total: derived.upNext.total }) }}
        </p>
        <template v-if="derived.upNext.theme">
          <p class="mt-1 text-3xl font-bold tracking-tight text-[var(--mode-color)]">
            {{ themeName(derived.upNext.theme, t) }}
          </p>
          <p class="mt-1 text-base text-white/80">{{ themeHint(derived.upNext.theme, t) }}</p>
        </template>
        <ol
          v-if="derived.upNext.total <= 12"
          class="mt-3 flex justify-center gap-1.5"
          aria-hidden="true"
        >
          <li
            v-for="round in derived.upNext.total"
            :key="round"
            class="h-2 rounded-full"
            :class="
              round < derived.upNext.round
                ? 'w-2 bg-white/70'
                : round === derived.upNext.round
                  ? 'w-6 bg-[var(--mode-color)]'
                  : 'w-2 bg-white/20'
            "
          />
        </ol>
      </section>

      <!--
        What the round asks for. In a round of called combinations that is the
        call being worked on, with the hand for each punch — the voice says
        "cross, hook, cross" and leaves left and right to the athlete. In a
        themed round it is the one instruction the coach gave at the bell,
        which stays put for anyone who missed it.

        Not a live region: she has just said it aloud, and a screen reader
        repeating her would talk over the next call. The height is held while
        nothing is shown so the clock above does not shift.
      -->
      <div
        v-else-if="call !== undefined"
        class="flex min-h-24 w-full max-w-sm items-center justify-center text-center"
      >
        <ol v-if="call !== ''" class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <li
            v-for="(step, index) in callSteps(call)"
            :key="index"
            class="flex items-center gap-1.5 text-2xl leading-none font-bold tracking-tight"
          >
            {{ step.label }}
            <span
              v-if="step.side"
              class="grid size-7 place-items-center rounded-md text-base"
              :class="
                step.side === 'L'
                  ? 'bg-[var(--mode-color)] text-[var(--mode-foreground)]'
                  : 'bg-white text-black'
              "
            >
              {{ step.side }}
            </span>
          </li>
        </ol>
        <p v-else-if="derived.theme" class="text-lg text-balance text-white/80">
          {{ themeHint(derived.theme, t) }}
        </p>
      </div>

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
          v-if="canCaptureRound()"
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
          {{ armedKey === 'finish' ? t('timer.run.finishConfirm') : t('timer.run.finish') }}
        </Button>
      </div>

      <Button
        v-if="canCaptureRound()"
        variant="ghost"
        class="text-white/70 hover:bg-white/10 hover:text-white"
        @click="finish"
      >
        {{ armedKey === 'finish' ? t('timer.run.finishConfirm') : t('timer.run.finish') }}
      </Button>
    </main>
  </div>
</template>
