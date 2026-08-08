import { onBeforeUnmount, watch, type MaybeRefOrGetter, toValue } from 'vue'

type WakeLockSentinelLike = {
  release: () => Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

/**
 * Holds a screen wake lock while `enabled` is true and the page is visible.
 *
 * Two things drive this — the `enabled` watcher and `visibilitychange` — and
 * both can fire while a previous `request()` is still in flight. Guarding on
 * `sentinel` alone does not help: it is only assigned *after* the await, so
 * two overlapping calls would both pass the guard, both acquire a lock, and
 * the first would be overwritten and never released — a lock the page cannot
 * let go of until it is closed. Serializing every call onto one promise chain
 * means each run observes the state the previous one left behind.
 */
export function useWakeLock(enabled: MaybeRefOrGetter<boolean>): void {
  let sentinel: WakeLockSentinelLike | undefined
  let pending: Promise<void> = Promise.resolve()

  async function release(): Promise<void> {
    const held = sentinel
    sentinel = undefined
    // The browser releases the lock itself when the page is hidden, so by the
    // time we ask, it may already be gone. Nothing here is worth a toast.
    await held?.release().catch(() => undefined)
  }

  async function apply(): Promise<void> {
    if (!toValue(enabled) || document.visibilityState !== 'visible') {
      await release()
      return
    }
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!wakeLock || sentinel) return
    sentinel = await wakeLock.request('screen').catch(() => undefined)
  }

  /** Queue behind whatever is already running; never reject into a listener. */
  function sync(): void {
    pending = pending.then(apply, apply).catch(() => undefined)
  }

  const stop = watch(() => toValue(enabled), sync, { immediate: true })
  document.addEventListener('visibilitychange', sync)

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', sync)
    pending = pending.then(release, release).catch(() => undefined)
  })
}
