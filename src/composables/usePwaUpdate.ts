import { useRegisterSW } from 'virtual:pwa-register/vue'
import { startPeriodicUpdateCheck } from '@/lib/swUpdateCheck'

/**
 * Service-worker update flow for `registerType: 'prompt'` (vite.config.ts).
 * When a new version is deployed, `needRefresh` flips to true and
 * PwaUpdatePrompt.vue offers a reload instead of silently swapping the app
 * out from under the user mid-interaction.
 *
 * Registration alone only checks for a new worker once. An installed PWA
 * resumed from the app switcher never navigates, so the periodic check in
 * `startPeriodicUpdateCheck` is what keeps long-lived sessions from sitting
 * on a stale build forever.
 *
 * Module-scoped, mirroring useLocale and useTheme: there is one service
 * worker per page no matter how many components consume the update flow, so
 * there must be one registration and one hourly check — a per-call
 * `useRegisterSW` would start a new page-lifetime interval per consumer.
 */
const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      startPeriodicUpdateCheck(swUrl, registration)
    }
  },
})

export function usePwaUpdate() {
  function reload(): void {
    void updateServiceWorker(true)
  }

  function dismiss(): void {
    needRefresh.value = false
  }

  return { needRefresh, reload, dismiss }
}
