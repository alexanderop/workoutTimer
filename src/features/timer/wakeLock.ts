import { Atom } from '@effect/atom-vue'
import { documentVisibleAtom } from '@/state/browser'
import { keepAwakeAtom } from '@/features/timer/atoms'

type WakeLockSentinelLike = {
  release: () => Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

/**
 * Holds a screen wake lock while a workout is on screen and the page is
 * visible. Subscribed from the running-timer screen; the lock follows
 * `keepAwakeAtom`.
 *
 * The hard part used to be that two independent triggers — the `enabled`
 * watcher and `visibilitychange` — could both fire while a previous
 * `request()` was still in flight, so two overlapping calls would both acquire
 * a lock and the first would be overwritten and never released. That was
 * solved by serializing every call onto one promise chain.
 *
 * As an atom the race cannot be expressed: both triggers are dependencies of
 * one read, the registry runs one read at a time, and a superseded read's
 * finalizer runs before the next one starts. All that remains is the in-flight
 * case, which the `released` flag below covers — the lock we are still waiting
 * for is released the moment it arrives.
 */
export const wakeLockEffectAtom = Atom.make((get) => {
  if (!(get(keepAwakeAtom) && get(documentVisibleAtom))) return null

  // SAFETY: `WakeLockNavigator` only adds the Screen Wake Lock API that
  // lib.dom does not declare yet; the property is read as possibly missing
  // and the very next line handles the browsers that do not have it.
  const wakeLock = (navigator as WakeLockNavigator).wakeLock
  if (!wakeLock) return null

  let released = false
  let sentinel: WakeLockSentinelLike | undefined

  // The browser releases the lock itself when the page is hidden, so by the
  // time we ask, it may already be gone. Nothing here is worth a toast.
  const release = (held: WakeLockSentinelLike): Promise<void> =>
    held.release().catch(() => undefined)

  void wakeLock
    .request('screen')
    .then((held) => {
      if (released) return release(held)
      sentinel = held
      return undefined
    })
    .catch(() => undefined)

  get.addFinalizer(() => {
    released = true
    if (sentinel) void release(sentinel)
    sentinel = undefined
  })

  return null
})
