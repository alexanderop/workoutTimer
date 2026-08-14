import { Atom } from '@effect/atom-vue'
import type { SupportedLocale } from '@/i18n'
import { i18n, SUPPORTED_LOCALES } from '@/i18n'
import { localStorageAtom, notifyLocalStorageChanged } from '@/state/browser'

export const LOCALE_STORAGE_KEY = 'workout-timer.locale'
const DEFAULT_LOCALE: SupportedLocale = 'en'

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value)
}

/**
 * The persisted locale.
 *
 * Normalizing in `decode` rather than in the side effect is what keeps a
 * hand-edited or stale value ("fr" from a build that still shipped French)
 * from reaching either i18n or the Settings select: every reader sees the
 * effective locale, so the two cannot disagree.
 */
export const localeAtom = localStorageAtom<SupportedLocale>({
  key: LOCALE_STORAGE_KEY,
  defaultValue: DEFAULT_LOCALE,
  decode: (raw) => (isSupportedLocale(raw) ? raw : DEFAULT_LOCALE),
  encode: (value) => value,
})

function applyLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  // index.html can only hardcode one lang; screen readers pick their voice
  // from this attribute, so it has to follow the effective locale.
  document.documentElement.lang = locale
}

export const localeEffectAtom = Atom.make((get) => {
  get.subscribe(localeAtom, applyLocale, { immediate: true })
  return null
}).pipe(Atom.keepAlive)

/**
 * Write the locale from outside a component, reaching every registry through
 * the storage notification — the counterpart of `setColorScheme`, and what
 * lets a test change the language without mounting the app.
 */
export function setStoredLocale(locale: SupportedLocale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  notifyLocalStorageChanged(LOCALE_STORAGE_KEY)
  applyLocale(locale)
}

/**
 * Restore the locale to its default and re-run the side effects the effect
 * atom owns (i18n's active locale, `<html lang>`).
 *
 * Called directly rather than left to the atom so the reset is synchronous and
 * idempotent — a subscriber would not fire at all when the value is already
 * `'en'` but the document was left in another language.
 * Test-only — see `src/__tests__/helpers/reset.ts`.
 */
export function resetLocaleState(): void {
  window.localStorage.removeItem(LOCALE_STORAGE_KEY)
  notifyLocalStorageChanged(LOCALE_STORAGE_KEY)
  applyLocale(DEFAULT_LOCALE)
}
