import { onBeforeUnmount, watch, type MaybeRefOrGetter, toValue } from 'vue'

type WakeLockSentinelLike = {
  release: () => Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export function useWakeLock(enabled: MaybeRefOrGetter<boolean>): void {
  let sentinel: WakeLockSentinelLike | undefined

  async function sync(): Promise<void> {
    if (!toValue(enabled) || document.visibilityState !== 'visible') {
      await sentinel?.release()
      sentinel = undefined
      return
    }
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!wakeLock || sentinel) return
    try {
      sentinel = await wakeLock.request('screen')
    } catch {
      sentinel = undefined
    }
  }

  const stop = watch(() => toValue(enabled), sync, { immediate: true })
  document.addEventListener('visibilitychange', sync)

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', sync)
    void sentinel?.release()
  })
}
