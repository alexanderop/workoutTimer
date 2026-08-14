import { resetInstallPromptState } from '@/state/install'
import { resetLocaleState } from '@/state/locale'
import { resetThemeState } from '@/state/theme'
import { resetDatabase } from '@/db'

/**
 * Full app-state reset for browser-tier tests: database, persisted
 * preferences, and theme class. App fixtures call this before mounting.
 *
 * Atom-held state (sessions, presets, toasts, the route, form drafts) needs no
 * reset here: renderApp provides a fresh atom registry per mount, so it never
 * outlives a test. What leaks between tests lives outside the registry —
 * IndexedDB, and localStorage. `localStorage.clear()` alone is not enough for
 * the latter: a write made in the same document fires no storage event, so an
 * already-mounted registry would keep serving the old value from the atom that
 * read the key. Each composable's reset therefore announces the change as well
 * as making it, and those are the source of truth here.
 *
 * No `nextTick`: the effects are applied synchronously now, where VueUse's
 * `flush: 'post'` watcher made callers wait a tick for the `.dark` class.
 */
export async function resetAppState(): Promise<void> {
  await resetDatabase()
  localStorage.clear()
  resetLocaleState()
  resetThemeState()
  resetInstallPromptState()
}
