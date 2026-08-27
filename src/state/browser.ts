import { Atom } from '@effect/atom-vue'

/**
 * Browser state as atoms.
 *
 * These replace the VueUse composables the app used to reach for
 * (`useStorage`, `useMediaQuery`, `useTimestamp`, `useEventListener`). VueUse
 * is built on `ref`/`computed`/`watch`, which is exactly the reactivity system
 * this codebase no longer writes against — see the state section of
 * docs/index.md. An atom expresses the same thing with the subscription tied
 * to the atom's own lifetime: `get.addFinalizer` runs when the last subscriber
 * goes away, so there is no component scope to remember to unwind.
 *
 * Every one of these degrades to a static value when its API is missing, so a
 * module that reads them at import time is safe in Node and in jsdom.
 */

const hasWindow = 'window' in globalThis

/**
 * A writable atom backed by a `localStorage` key.
 *
 * `decode`/`encode` are explicit rather than JSON because the keys this app
 * already shipped hold bare strings (`'dark'`, `'en'`) written by VueUse's
 * string serializer. Quoting them on the next write would strand every
 * existing install's preference.
 *
 * `keepAlive` because a preference outlives the screen that reads it: a
 * settings page that unmounts must not drop the listener that keeps a second
 * tab's write in sync.
 */
export function localStorageAtom<A>(options: {
  readonly key: string
  readonly defaultValue: A
  readonly decode: (raw: string) => A
  readonly encode: (value: A) => string
}): Atom.Writable<A, A> {
  const read = (): A => {
    if (!hasWindow) return options.defaultValue
    const raw = window.localStorage.getItem(options.key)
    return raw === null ? options.defaultValue : options.decode(raw)
  }

  return Atom.writable<A, A>(
    (get) => {
      if (hasWindow) {
        // A `storage` event fires only for *other* documents, so this covers
        // the second-tab case; same-document writes go through the write
        // function below, which sets the atom directly.
        const handle = (event: StorageEvent): void => {
          if (event.key !== null && event.key !== options.key) return
          get.setSelf(read())
        }
        window.addEventListener('storage', handle)
        get.addFinalizer(() => window.removeEventListener('storage', handle))
      }
      return read()
    },
    (ctx, value) => {
      if (hasWindow) window.localStorage.setItem(options.key, options.encode(value))
      ctx.setSelf(value)
    },
  ).pipe(Atom.keepAlive)
}

/**
 * Tell every `localStorageAtom` on this key that its backing value changed.
 *
 * The `storage` event fires only for *other* documents, so a write made
 * outside an atom — a test helper, `resetThemeState` — is invisible to the
 * atoms holding that key. Announcing it is what keeps a reset from leaving a
 * mounted registry on the old value while storage looks clean.
 */
export function notifyLocalStorageChanged(key: string): void {
  if (!hasWindow) return
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: window.localStorage }))
}

/**
 * `matchMedia`, one atom per query.
 *
 * This is the browser's state, not the app's — which is why
 * `src/components/ui/*` is allowed to read this module and no other one in
 * `src/state/`: a primitive that adapts to a coarse pointer is still
 * presentational.
 */
export const mediaQueryAtom = Atom.family((query: string) =>
  Atom.make((get) => {
    const media = hasWindow ? window.matchMedia?.(query) : undefined
    if (!media) return false

    const handle = (): void => get.setSelf(media.matches)
    media.addEventListener('change', handle)
    get.addFinalizer(() => media.removeEventListener('change', handle))
    return media.matches
  }).pipe(Atom.keepAlive),
)

/**
 * `Date.now()`, re-read on an interval, one atom per period.
 *
 * Deliberately *not* `keepAlive`: the interval exists only while something
 * renders it, so leaving the running-timer screen stops the ticking rather
 * than leaving a page-lifetime timer behind.
 */
export const clockAtom = Atom.family((intervalMs: number) =>
  Atom.make((get) => {
    const id = setInterval(() => get.setSelf(Date.now()), intervalMs)
    get.addFinalizer(() => clearInterval(id))
    return Date.now()
  }),
)

/**
 * Coarse-pointer detection, used to adapt focus and keyboard behaviour on
 * touch devices (not auto-focusing an input while a sheet is still animating).
 *
 * A named atom rather than an inline `mediaQueryAtom('(pointer: coarse)')` at
 * each call site: the family memoizes per query string, so the two would be
 * the same atom anyway, and the name is what says which question is being
 * asked.
 */
export const touchDeviceAtom = mediaQueryAtom('(pointer: coarse)')

/** `document.visibilityState === 'visible'`. */
export const documentVisibleAtom = Atom.make((get) => {
  if (!('document' in globalThis)) return true

  const handle = (): void => get.setSelf(document.visibilityState === 'visible')
  document.addEventListener('visibilitychange', handle)
  get.addFinalizer(() => document.removeEventListener('visibilitychange', handle))
  return document.visibilityState === 'visible'
}).pipe(Atom.keepAlive)
