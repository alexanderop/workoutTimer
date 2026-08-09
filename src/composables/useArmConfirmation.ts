import { onScopeDispose, readonly, shallowRef } from 'vue'

const DEFAULT_CONFIRMATION_WINDOW_MS = 3_000

/**
 * Guards irreversible actions behind a second activation within a short window.
 *
 * One key is armed at a time. Requesting a different action replaces the old
 * one, which prevents a screen with several destructive controls from leaving
 * multiple actions primed simultaneously. The timer is tied to the caller's
 * Vue scope and cannot update state after that scope is gone.
 */
export function useArmConfirmation<Key>(windowMs = DEFAULT_CONFIRMATION_WINDOW_MS) {
  const armedKey = shallowRef<Key | undefined>()
  let timeout: ReturnType<typeof setTimeout> | undefined

  function disarm(): void {
    if (timeout !== undefined) clearTimeout(timeout)
    timeout = undefined
    armedKey.value = undefined
  }

  function requestConfirmation(key: Key): boolean {
    if (Object.is(armedKey.value, key)) {
      disarm()
      return true
    }

    disarm()
    armedKey.value = key
    timeout = setTimeout(disarm, windowMs)
    return false
  }

  onScopeDispose(disarm)

  return {
    armedKey: readonly(armedKey),
    disarm,
    isArmed: (key: Key) => Object.is(armedKey.value, key),
    requestConfirmation,
  }
}
