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
 * `once: true` on both listeners means the first gesture of either kind
 * disarms both handlers; the finalizer covers leaving the screen before any
 * gesture arrives. One unlock is all we need — `unlockTimerAudio` is
 * idempotent regardless.
 */
export const audioUnlockEffectAtom = Atom.make((get): null => {
  const options = { once: true, passive: true } as const
  document.addEventListener('pointerdown', unlockTimerAudio, options)
  document.addEventListener('keydown', unlockTimerAudio, options)

  get.addFinalizer(() => {
    document.removeEventListener('pointerdown', unlockTimerAudio)
    document.removeEventListener('keydown', unlockTimerAudio)
  })

  return null
})
