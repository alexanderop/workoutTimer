import { useMediaQuery, useStorage } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import type { InstallPlatform } from '@/lib/installPlatform'
import { detectInstallPlatform } from '@/lib/installPlatform'

export const INSTALL_HINT_STORAGE_KEY = 'workout-timer.install-hint-dismissed'

const HINT_DELAY_MS = 2000

const platform: InstallPlatform = detectInstallPlatform({
  userAgent: globalThis.navigator?.userAgent ?? '',
  maxTouchPoints: globalThis.navigator?.maxTouchPoints ?? 0,
})

// Keep the real browser event unproxied: prompt() and userChoice belong to
// this single-use event instance.
const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null)
const hintDismissed = useStorage(INSTALL_HINT_STORAGE_KEY, false)
const displayModeStandalone = useMediaQuery('(display-mode: standalone)')
const launchedFromHomeScreen = globalThis.navigator?.standalone === true

const isInstalled = computed(() => displayModeStandalone.value || launchedFromHomeScreen)
const canInstall = computed(() => deferredPrompt.value !== null || platform === 'ios')
const isEligibleForHint = computed(
  () => canInstall.value && !isInstalled.value && !hintDismissed.value,
)

const hintVisible = shallowRef(false)
let hintTimer: ReturnType<typeof setTimeout> | undefined

watch(
  isEligibleForHint,
  (eligible) => {
    clearTimeout(hintTimer)
    if (!eligible) {
      hintVisible.value = false
      return
    }

    hintTimer = setTimeout(() => {
      hintVisible.value = true
    }, HINT_DELAY_MS)
  },
  { immediate: true, flush: 'sync' },
)

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt.value = event
})

window.addEventListener('appinstalled', () => {
  deferredPrompt.value = null
  hintDismissed.value = true
})

export function useInstallPrompt() {
  async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
    const event = deferredPrompt.value
    if (!event) return null

    // The prompt event is single-use. Clear it before awaiting so a double tap
    // cannot invoke it twice.
    deferredPrompt.value = null
    await event.prompt()
    const { outcome } = await event.userChoice

    if (outcome === 'accepted') hintDismissed.value = true
    return outcome
  }

  function dismissHint(): void {
    hintDismissed.value = true
  }

  return {
    canInstall,
    canPromptDirectly: computed(() => deferredPrompt.value !== null),
    isInstalled,
    platform,
    hintVisible,
    promptInstall,
    dismissHint,
  }
}

/** Clears module-scoped browser state between browser-tier tests. */
export function resetInstallPromptState(): void {
  deferredPrompt.value = null
  hintDismissed.value = false
  hintVisible.value = false
}
