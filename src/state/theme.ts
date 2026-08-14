import { Atom } from '@effect/atom-vue'
import { localStorageAtom, mediaQueryAtom, notifyLocalStorageChanged } from '@/state/browser'
import { applyThemeColor } from '@/lib/themeColor'

/**
 * The key VueUse's `useDark` wrote to before this app owned its own theme
 * state. Kept verbatim, and read as a bare string rather than JSON, so an
 * existing install's choice survives the change.
 */
export const COLOR_SCHEME_STORAGE_KEY = 'vueuse-color-scheme'

export type ColorScheme = 'auto' | 'light' | 'dark'

const DEFAULT_COLOR_SCHEME: ColorScheme = 'auto'
const COLOR_SCHEMES: ReadonlyArray<string> = ['auto', 'light', 'dark']

/**
 * The persisted preference: `'auto'` follows the OS, the other two override
 * it. Three states, not two — which is the reason this is not simply a boolean
 * atom, and the reason `resetThemeState` can restore the true default where a
 * writable `isDark` never could.
 */
const colorSchemeAtom = localStorageAtom<ColorScheme>({
  key: COLOR_SCHEME_STORAGE_KEY,
  defaultValue: DEFAULT_COLOR_SCHEME,
  decode: (raw) => (COLOR_SCHEMES.includes(raw) ? (raw as ColorScheme) : DEFAULT_COLOR_SCHEME),
  encode: (value) => value,
})

const prefersDarkAtom = mediaQueryAtom('(prefers-color-scheme: dark)')

/**
 * What is actually rendered. Writing to it collapses `'auto'` into the
 * explicit choice the user just made, which is what a toggle means.
 */
export const isDarkAtom: Atom.Writable<boolean> = Atom.writable(
  (get) => {
    const scheme = get(colorSchemeAtom)
    return scheme === 'auto' ? get(prefersDarkAtom) : scheme === 'dark'
  },
  (ctx, isDark: boolean) => ctx.set(colorSchemeAtom, isDark ? 'dark' : 'light'),
)

function applyTheme(isDark: boolean): void {
  // The `.dark` class is what the Tailwind `dark:` variant and the token block
  // in style.css react to; `useDark` used to own it.
  document.documentElement.classList.toggle('dark', isDark)
  // A manual override diverges from `prefers-color-scheme`, which is all the
  // static <meta name="theme-color"> tags in index.html can see — keep the
  // installed app's status bar on the theme actually rendered.
  applyThemeColor(isDark)
}

/**
 * The side effect, as an atom: subscribing runs it, and it stays subscribed
 * for the app's lifetime because of `keepAlive`. This is the shape every
 * `watch(x, sideEffect, { immediate: true })` in this codebase became, and the
 * `EffectAtom` suffix is what puts it in the browser tier — `isDarkAtom` above
 * is a value and belongs to the unit tier.
 */
export const themeEffectAtom = Atom.make((get) => {
  get.subscribe(isDarkAtom, applyTheme, { immediate: true })
  return null
}).pipe(Atom.keepAlive)

const prefersDark = (): boolean =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

/**
 * Write the preference from outside a component — a visual test picking a
 * scheme before taking its screenshot, or the reset below.
 *
 * Going through storage rather than through a registry is what makes it reach
 * *every* registry: the notification is the same one a second tab's write
 * would produce, so an app already mounted follows along.
 */
export function setColorScheme(scheme: ColorScheme): void {
  window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
  notifyLocalStorageChanged(COLOR_SCHEME_STORAGE_KEY)
  applyTheme(scheme === 'auto' ? prefersDark() : scheme === 'dark')
}

/**
 * Restore the theme to its default (`'auto'` — follow the OS preference).
 *
 * Atom-held state needs no reset of its own: `renderApp` provides a fresh
 * registry per mount. What survives a registry is localStorage and the class
 * already on <html>, so those are what this clears — synchronously, unlike
 * the VueUse version, whose `flush: 'post'` watcher made callers await a tick.
 * Test-only — see `src/__tests__/helpers/reset.ts`.
 */
export function resetThemeState(): void {
  window.localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY)
  notifyLocalStorageChanged(COLOR_SCHEME_STORAGE_KEY)
  applyTheme(prefersDark())
}
