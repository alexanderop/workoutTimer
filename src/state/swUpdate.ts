import { Atom } from '@effect/atom-vue'

/**
 * "A new version of the app is waiting" — the state behind PwaUpdatePrompt.vue.
 *
 * A plain writable atom with no service worker in sight, which is the whole
 * point of the split: `src/state/swRegistration.ts` imports
 * `virtual:pwa-register/vue` and is therefore un-importable outside Vite, so
 * anything that lived in the same module could never be read by the Node unit
 * tier. The bridge writes here; everything that *reasons* about the update
 * lives here and stays testable against a bare registry.
 *
 * `keepAlive` because there is one service worker per page: the flag must
 * outlive the banner that renders it, or dismissing and re-showing would
 * re-register.
 */
export const needRefreshAtom: Atom.Writable<boolean> = Atom.make(false).pipe(Atom.keepAlive)

/**
 * Written to ask the page to activate the waiting worker and reload.
 *
 * A request rather than a call, for the same reason `navigationAtom` is one: a
 * component has no business holding the registration, and the bridge that owns
 * it is subscribed here. Cleared on the way out so asking twice is two events.
 */
export const reloadRequestedAtom: Atom.Writable<boolean> = Atom.make(false).pipe(Atom.keepAlive)
