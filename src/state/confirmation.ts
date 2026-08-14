import { Atom, type AtomRegistry } from '@effect/atom-vue'

const CONFIRMATION_WINDOW_MS = 3_000

/**
 * Guards irreversible actions behind a second activation within a short window.
 *
 * One key is armed at a time per scope. Requesting a different action replaces
 * the old one, which prevents a screen with several destructive controls from
 * leaving multiple actions primed simultaneously.
 *
 * The disarm timer lives inside the atom rather than in a component scope, so
 * the two things that used to be separate — "clear the timeout" and "the
 * caller went away" — are the same event: the last unsubscribe disposes the
 * atom, which runs the finalizer and drops the armed key.
 */
/**
 * Where the armed key is actually stored.
 *
 * The public atom below cannot hold it, because the expiry timer has to be
 * per-registry and the only place a family can put per-registry state is
 * inside its *read* — `WriteContext` has no `registry`, so the write function
 * cannot tell one apart. Writing an inner atom and letting the read react is
 * what routes every arm through a subscription that already knows which
 * registry it belongs to.
 */
const armedRecordAtom = Atom.family((_scope: string) => Atom.make<string | undefined>(undefined))

export const armedConfirmationAtom = Atom.family((scope: string) => {
  const record = armedRecordAtom(scope)

  return Atom.writable<string | undefined, string | undefined>(
    (get) => {
      // `let` inside the read, not in the family factory: a family memoizes one
      // atom *object* per key at module scope, so anything the factory closes
      // over is shared by every registry that mounts it. That is not
      // hypothetical — it is what made a second registry's read overwrite the
      // first's disarm callback, firing the expiry into the wrong registry and
      // leaving the first armed forever.
      let timer: ReturnType<typeof setTimeout> | undefined
      const registry = get.registry

      get.subscribe(
        record,
        (armed) => {
          clearTimeout(timer)
          get.setSelf(armed)
          if (armed === undefined) return
          timer = setTimeout(() => registry.set(record, undefined), CONFIRMATION_WINDOW_MS)
        },
        { immediate: true },
      )

      get.addFinalizer(() => {
        clearTimeout(timer)
        // Disarm on the way out, not just cancel the timer: the registry holds
        // the value whether or not anyone is subscribed, so leaving a screen
        // with a delete primed and coming back later must not find it still
        // primed. Deferred by a microtask so the write lands after teardown.
        queueMicrotask(() => registry.set(record, undefined))
      })

      return undefined
    },
    (ctx, key: string | undefined) => {
      ctx.set(record, key)
    },
  )
})

/**
 * True on the *second* request for the same key inside the window; arms it and
 * returns false on the first.
 *
 * Registry-taking rather than an `Atom.fnSync`: the caller needs the answer in
 * the same click handler that asked, and `useAtomSet` hands back a setter, not
 * a return value. `injectRegistry()` is the bridge — the same one
 * `showToastIn` takes, and the reason both are unit-testable against a bare
 * `AtomRegistry.make()` with no component in sight.
 *
 * The caller is expected to be reading `armedConfirmationAtom(scope)` too (it
 * is what its label says), which is what keeps the atom mounted and so gives
 * the expiry timer a way to write back.
 */
export function requestConfirmationIn(
  registry: AtomRegistry.AtomRegistry,
  scope: string,
  key: string,
): boolean {
  const atom = armedConfirmationAtom(scope)
  const confirmed = registry.get(atom) === key
  registry.set(atom, confirmed ? undefined : key)
  return confirmed
}

/** Drop whatever is armed for a scope — the screen is done with it. */
export function disarmConfirmationIn(registry: AtomRegistry.AtomRegistry, scope: string): void {
  registry.set(armedConfirmationAtom(scope), undefined)
}
