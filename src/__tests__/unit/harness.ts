import { AtomRegistry, type Atom } from '@effect/atom-vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'

/**
 * The whole harness for an atom test: a registry, and something subscribed.
 *
 * Subscribing matters and is easy to forget. `registry.get(atom)` computes a
 * read and throws the result away, so an atom whose read installs a timer, a
 * listener or a `get.subscribe` has nothing keeping it mounted — the finalizer
 * runs immediately and nothing ever writes back. Mounting is what a component
 * does with `useAtomValue`, and it is what these tests do instead of rendering
 * one.
 *
 * `dispose()` unwinds every subscription and then the registry, which is the
 * other half of what `renderApp` does per browser test: it runs the finalizers,
 * so a spec cannot leak a live interval into the next one.
 */
export function harness() {
  const registry = AtomRegistry.make()
  const stops: Array<() => void> = []
  const mounted = new WeakSet<object>()

  function mount<A>(atom: Atom.Atom<A>): void {
    if (mounted.has(atom)) return
    mounted.add(atom)
    stops.push(registry.subscribe(atom, () => {}, { immediate: true }))
  }

  return {
    registry,

    /** Mount an atom and keep it mounted for the rest of the test. */
    mount,

    /**
     * Mount a writable atom, then write it — which is the order that matters.
     *
     * `registry.set` on an *unmounted* function atom (`Atom.fn`, `Atom.fnSync`,
     * a `dbRuntime.fn` mutation edge) is silently a no-op: there is no
     * subscriber, so there is nothing to run the program and nothing to publish
     * its result to. A component never hits this because `useAtomSet` mounts
     * what it is about to write. A bare registry has to say so.
     */
    write<R, W>(atom: Atom.Writable<R, W>, value: W): void {
      mount(atom)
      registry.set(atom, value)
    },

    /** Mount an atom and record every value it publishes, in order. */
    record<A>(atom: Atom.Atom<A>): Array<A> {
      const seen: Array<A> = []
      stops.push(registry.subscribe(atom, (value) => seen.push(value), { immediate: true }))
      return seen
    },

    get: <A>(atom: Atom.Atom<A>): A => registry.get(atom),

    set: <R, W>(atom: Atom.Writable<R, W>, value: W): void => registry.set(atom, value),

    dispose(): void {
      for (const stop of stops) stop()
      registry.dispose()
    },
  }
}

/**
 * A router with the app's route *shapes* and nothing behind them.
 *
 * Not `createAppRouter`: vue-router resolves a route's async component during
 * navigation, and this tier has no plugin that can transform a `.vue` file.
 * What these tests need from a router is its paths, params and `meta` — which
 * is exactly what a stub component leaves intact.
 */
const stubRoutes: Array<RouteRecordRaw> = [
  { path: '/', name: 'timer', component: {} },
  { path: '/timer/:mode', name: 'timer-setup', component: {} },
  { path: '/session/:id', name: 'timer-run', component: {}, meta: { hideNav: true } },
  { path: '/session/:id/result', name: 'timer-result', component: {}, meta: { hideNav: true } },
  { path: '/history', name: 'history', component: {} },
  { path: '/history/:id', name: 'session-detail', component: {} },
]

/** A router already sitting on `path`, ready to hand to `connectRoute`. */
export async function stubRouter(path: string): Promise<Router> {
  const router = createRouter({ history: createMemoryHistory(), routes: stubRoutes })
  await router.push(path)
  await router.isReady()
  return router
}
