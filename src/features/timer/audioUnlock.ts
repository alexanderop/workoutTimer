import { Atom } from '@effect/atom-vue'
import { unlockTimerAudio } from '@/features/timer/timerFeedback'

/**
 * Opens the AudioContext on the first gesture anywhere on the page.
 *
 * An AudioContext may only be created from a user gesture, and the run screen
 * is reachable without passing through the setup screen that used to be the
 * only place we asked for one — "Resume timer" on the home screen, or a reload
 * straight onto a running workout's URL. Without this the header renders the
 * sound-on icon over a timer that never makes a sound.
 *
 * The listeners were `onMounted` / `onBeforeUnmount` inside the run screen: the
 * one hand-rolled lifecycle left in a `<script setup>` block, and so the one
 * side effect no test could reach without rendering the whole screen. As an
 * effect atom, subscribing is what arms it and the last unsubscribe is what
 * disarms it — the same shape as `wakeLockEffectAtom` beside it, and the same
 * shape every `watch(…, { immediate: true })` in this codebase became.
 *
 * The handler disarms *both* listeners rather than relying on `once: true`,
 * which only removes the one that fired — a tap would otherwise leave the
 * `keydown` listener on `document` for the life of the screen. The finalizer
 * covers the other order: leaving before any gesture arrives. One unlock is
 * all we need, and `unlockTimerAudio` is idempotent regardless.
 */
export const audioUnlockEffectAtom = Atom.make((get): null => {
  const unlockOnFirstGesture = (): void => {
    stopListening()
    unlockTimerAudio()
  }

  function stopListening(): void {
    document.removeEventListener('pointerdown', unlockOnFirstGesture)
    document.removeEventListener('keydown', unlockOnFirstGesture)
  }

  const options = { once: true, passive: true } as const
  document.addEventListener('pointerdown', unlockOnFirstGesture, options)
  document.addEventListener('keydown', unlockOnFirstGesture, options)

  get.addFinalizer(stopListening)

  return null
})
