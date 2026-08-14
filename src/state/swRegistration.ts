import type { AtomRegistry } from '@effect/atom-vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { startPeriodicUpdateCheck } from '@/lib/swUpdateCheck'
import { needRefreshAtom, reloadRequestedAtom } from '@/state/swUpdate'

/**
 * Service-worker update flow for `registerType: 'prompt'` (vite.config.ts).
 * When a new version is deployed, `needRefreshAtom` flips to true and
 * PwaUpdatePrompt.vue offers a reload instead of silently swapping the app out
 * from under the user mid-interaction.
 *
 * Registration alone only checks for a new worker once. An installed PWA
 * resumed from the app switcher never navigates, so the periodic check in
 * `startPeriodicUpdateCheck` is what keeps long-lived sessions from sitting on
 * a stale build forever.
 *
 * This is the sibling of `connectRoute`: one call per app instance, from
 * `main.ts`, bridging a reactivity system this app does not use into the one
 * it does. `useRegisterSW` is the last third-party `Ref` boundary in the
 * codebase, and it is crossed here through its `onNeedRefresh` callback rather
 * than its returned `Ref` — a callback needs no `watch` to observe, so the ref
 * never escapes this module.
 *
 * It lives in its own file because `virtual:pwa-register/vue` only resolves
 * under Vite: keeping it out of `src/state/swUpdate.ts` is what lets the Node
 * unit tier import the atoms.
 *
 * Not called by the test `renderApp` helper — there is no service worker in
 * the browser tier, and a spec that wants the banner writes `needRefreshAtom`
 * directly. Returns the unregister function.
 */
export function connectServiceWorker(registry: AtomRegistry.AtomRegistry): () => void {
  const { updateServiceWorker } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      registry.set(needRefreshAtom, true)
    },
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        startPeriodicUpdateCheck(swUrl, registration)
      }
    },
  })

  return registry.subscribe(reloadRequestedAtom, (requested) => {
    if (!requested) return
    // Clear it first, so a second request later is a change the subscriber
    // sees rather than a write that dedupes to nothing.
    registry.set(reloadRequestedAtom, false)
    void updateServiceWorker(true)
  })
}
