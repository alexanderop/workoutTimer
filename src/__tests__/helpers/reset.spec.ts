import { AtomRegistry } from '@effect/atom-vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCALE_STORAGE_KEY, localeAtom, setStoredLocale } from '@/state/locale'
import { COLOR_SCHEME_STORAGE_KEY, isDarkAtom, setColorScheme } from '@/state/theme'
import { i18n } from '@/i18n'
import { resetAppState } from './reset'

function themeColorMeta(): string | undefined {
  return document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
}

/**
 * A registry that has just been created is what a freshly mounted app sees, so
 * reading one is how this spec asks "would the next test start clean?" — the
 * atom-shaped replacement for reading a module-scoped ref.
 */
const freshRegistry = () => AtomRegistry.make()

/**
 * The guarantee docs/testing-strategy.md calls non-negotiable: whatever a test
 * did to the shared preferences, the next test starts from defaults.
 *
 * `localStorage.clear()` cannot deliver that on its own — a same-document write
 * fires no storage event, so an already-mounted registry would keep serving the
 * old locale and theme from the atoms that read those keys.
 */
describe('resetAppState', () => {
  beforeEach(resetAppState)

  it('returns locale and theme to their defaults after the UI changed them', async () => {
    // The default color scheme is 'auto', so "default dark" is whatever the OS
    // reports — hardcoding light here would be a lie on a dark-mode machine.
    const defaultDark = freshRegistry().get(isDarkAtom)
    const defaultThemeColor = themeColorMeta()

    setStoredLocale('de')
    setColorScheme(defaultDark ? 'light' : 'dark')

    expect(i18n.global.locale.value).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(document.documentElement.classList.contains('dark')).toBe(!defaultDark)
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe(defaultDark ? 'light' : 'dark')
    expect(freshRegistry().get(isDarkAtom)).toBe(!defaultDark)

    await resetAppState()

    // The values a new registry would read, not just the storage behind them.
    expect(freshRegistry().get(localeAtom)).toBe('en')
    expect(freshRegistry().get(isDarkAtom)).toBe(defaultDark)
    // Everything the two effect atoms own has to follow back too.
    expect(i18n.global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.classList.contains('dark')).toBe(defaultDark)
    expect(themeColorMeta()).toBe(defaultThemeColor)
    // The key is cleared rather than written: absent *is* 'auto', which is the
    // real default — follow the OS, not a hardcoded 'light'.
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
  })

  // The next two tests are a pair: the first dirties the shared state and
  // deliberately does not clean up, the second passes only if the beforeEach
  // hook undid it.
  it('tolerates a test that dirties locale and theme without cleaning up', () => {
    const wasDark = freshRegistry().get(isDarkAtom)

    setStoredLocale('de')
    setColorScheme(wasDark ? 'light' : 'dark')

    expect(document.documentElement.lang).toBe('de')
    expect(document.documentElement.classList.contains('dark')).toBe(!wasDark)
  })

  it('starts from the defaults regardless of what ran before it', () => {
    const isDark = freshRegistry().get(isDarkAtom)

    expect(freshRegistry().get(localeAtom)).toBe('en')
    expect(i18n.global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.classList.contains('dark')).toBe(isDark)
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull()
  })
})
