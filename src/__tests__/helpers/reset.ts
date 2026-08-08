import { nextTick } from 'vue'
import { resetInstallPromptState } from '@/composables/useInstallPrompt'
import { resetLocaleState } from '@/composables/useLocale'
import { resetThemeState } from '@/composables/useTheme'
import { resetDatabase } from '@/db'

/**
 * Full app-state reset for browser-tier tests: database, persisted
 * preferences, and theme class. App fixtures call this before mounting.
 *
 * Atom-held state (sessions, presets, toasts) needs no reset here:
 * renderApp provides a fresh atom registry per mount, so it never outlives a
 * test. What does leak between tests lives outside the registry —
 * IndexedDB, and the module-scoped VueUse refs behind useLocale and
 * useTheme. `localStorage.clear()` alone is not enough for those refs:
 * writes made in the same document fire no storage event, so the in-memory
 * values would survive into every later test in the file. Each composable
 * therefore exposes its own reset, and those are the source of truth here.
 */
export async function resetAppState(): Promise<void> {
  await resetDatabase()
  localStorage.clear()
  resetLocaleState()
  resetThemeState()
  resetInstallPromptState()
  // useColorMode applies the `.dark` class from a `flush: 'post'` watcher.
  await nextTick()
}
