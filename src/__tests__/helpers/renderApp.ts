import { AtomRegistry, registryKey } from '@effect/atom-vue'
import { render } from 'vitest-browser-vue'
import { createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import { i18n } from '@/i18n'
import { createAppRouter } from '@/router'
import { connectRoute } from '@/state/route'

/**
 * Mounts the full app (shell, router, i18n) the way main.ts does, but with
 * memory history so tests don't fight over the page URL — and with a fresh
 * atom registry per render, so no atom state (sessions, presets, toasts)
 * leaks from one test into the next. IndexedDB is the one thing a
 * registry cannot isolate; resetAppState still clears it.
 */
export async function renderApp(initialPath = '/') {
  const router = createAppRouter(createMemoryHistory())
  await router.push(initialPath)
  await router.isReady()

  // Same wiring as main.ts: the route reaches components as an atom, never as
  // `useRoute()`. Registered after the initial push, which `connectRoute`
  // covers by seeding from `currentRoute`.
  const registry = AtomRegistry.make()
  const disconnectRoute = connectRoute(router, registry)

  const screen = render(App, {
    global: {
      plugins: [i18n, router],
      provide: {
        [registryKey as symbol]: registry,
      },
    },
  })

  return {
    screen,
    container: screen.container,
    router,
    // unmount() removes the DOM synchronously but is typed Promise-returning;
    // hand the promise to callers so fixture cleanup can await it.
    //
    // Disposing the registry is what unwinds the `keepAlive` atoms — every
    // finalizer runs, so the `storage`, `matchMedia`, `visibilitychange` and
    // `beforeinstallprompt` listeners in src/state/browser.ts go with the
    // test rather than accumulating on the one page all of them share.
    cleanup: async (): Promise<void> => {
      await screen.unmount()
      disconnectRoute()
      registry.dispose()
    },
  }
}
