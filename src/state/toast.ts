import { Atom, type AtomRegistry } from '@effect/atom-vue'

type ToastMessage = {
  readonly id: string
  readonly message: string
  readonly durationMs: number
}

const DEFAULT_TOAST_DURATION_MS = 3000

/**
 * Ephemeral confirmation messages, rendered by ToastViewport.vue (mounted once
 * in App.vue).
 *
 * Use this for "never-silent" confirmations after an action that has no other
 * visible feedback (e.g. saving from a sheet that then closes itself).
 *
 * Shared state lives in an atom, not in module-scoped refs: the value is held
 * by the atom registry, so browser tests get a clean slate by providing a
 * fresh registry (see renderApp) instead of calling `$reset()` on a store.
 */
export const toastsAtom = Atom.make<ReadonlyArray<ToastMessage>>([])

/**
 * The registry-taking form, so a plain atom can raise a toast too.
 *
 * The run driver reports a failed automatic transition this way: it has a
 * registry (`get.registry`) but no component, and a background write that
 * silently fails is exactly the case a toast exists for.
 */
export function showToastIn(
  registry: AtomRegistry.AtomRegistry,
  message: string,
  durationMs = DEFAULT_TOAST_DURATION_MS,
): void {
  registry.set(toastsAtom, [
    ...registry.get(toastsAtom),
    { id: crypto.randomUUID(), message, durationMs },
  ])
}

function dismissToastIn(registry: AtomRegistry.AtomRegistry, id: string): void {
  registry.set(
    toastsAtom,
    registry.get(toastsAtom).filter((toast) => toast.id !== id),
  )
}

/**
 * Every pending expiry, owned by an atom rather than by whoever raised the
 * toast — which is what the finalizer below is for.
 *
 * `showToastIn` used to schedule its own `setTimeout`, and a timer scheduled
 * that way outlives everything: the browser tier caught it the moment
 * `renderApp` started disposing its registry per test, because a three-second
 * dismissal fired into a registry that no longer existed. Holding the timers
 * here makes "the toast viewport went away" and "cancel the pending
 * dismissals" the same event.
 *
 * Subscribing is what starts it, so a toast raised while nothing renders the
 * viewport does not expire — which is correct: nobody saw it.
 */
export const toastExpiryEffectAtom = Atom.make((get) => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const registry = get.registry

  get.subscribe(
    toastsAtom,
    (toasts) => {
      for (const toast of toasts) {
        if (timers.has(toast.id)) continue
        timers.set(
          toast.id,
          setTimeout(() => {
            timers.delete(toast.id)
            dismissToastIn(registry, toast.id)
          }, toast.durationMs),
        )
      }
      // A toast dismissed by hand takes its timer with it, so a later id
      // cannot collide with a stale entry.
      for (const [id, timer] of timers) {
        if (toasts.some((toast) => toast.id === id)) continue
        clearTimeout(timer)
        timers.delete(id)
      }
    },
    { immediate: true },
  )

  get.addFinalizer(() => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  })

  return null
})

/**
 * The component-facing edge: `const showToast = useAtomSet(() => showToastAtom)`.
 *
 * An `Atom.fnSync` rather than a `useToastStore()` composable, because that is
 * all a composable was ever doing here — reach for the registry and close over
 * it. Writing an argument runs the function; nobody reads the result, so the
 * `Option` this atom holds is ignored on purpose.
 */
export const showToastAtom = Atom.fnSync((message: string, get) =>
  showToastIn(get.registry, message),
)

/** Dismiss by id — what the viewport's close button writes. */
export const dismissToastAtom = Atom.fnSync((id: string, get) => dismissToastIn(get.registry, id))
