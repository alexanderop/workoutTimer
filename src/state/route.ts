import { Atom, type AtomRegistry } from '@effect/atom-vue'
import type { RouteLocationNormalizedGeneric, Router } from 'vue-router'
import { RouteNames, type RouteName } from '@/router/routeNames'

/**
 * The current route, as an atom.
 *
 * `useRoute()` hands a component a Vue-reactive object, which is the one
 * remaining way route state could re-enter the app as a `ref`. Snapshotting it
 * into an atom instead means "which session is this screen showing?" is an
 * ordinary derivation over `routeAtom` and `sessionsAtom` — testable against a
 * bare registry, and readable by other atoms rather than only by components.
 *
 * Read the *narrow* atoms below, never `routeAtom` itself. Atoms dedupe with
 * `Object.is`, and every navigation writes a fresh snapshot object — so a
 * consumer of `routeAtom` recomputes on every route change, while a consumer
 * of `routeParamAtom('id')` sees a string that compares equal and stays put.
 *
 * Exactly one writer feeds it — the `router.afterEach` in `main.ts` — and that
 * hook is the whole of the bridge between vue-router's reactivity and this
 * app's.
 */
export interface RouteSnapshot {
  readonly name: RouteName | undefined
  readonly params: Readonly<Record<string, string>>
  readonly query: Readonly<Record<string, string>>
  readonly hideNav: boolean
}

const INITIAL_ROUTE: RouteSnapshot = {
  name: undefined,
  params: {},
  query: {},
  hideNav: false,
}

const routeAtom: Atom.Writable<RouteSnapshot> = Atom.make(INITIAL_ROUTE).pipe(Atom.keepAlive)

export const routeNameAtom = Atom.map(routeAtom, (route) => route.name)

export const hideNavigationAtom = Atom.map(routeAtom, (route) => route.hideNav)

/** A path parameter (`/timer/run/:id`), one atom per name. */
export const routeParamAtom = Atom.family((name: string) =>
  Atom.map(routeAtom, (route) => route.params[name]),
)

/** A query parameter (`?preset=…`), one atom per name. */
export const routeQueryAtom = Atom.family((name: string) =>
  Atom.map(routeAtom, (route) => route.query[name]),
)

/**
 * The write side of the bridge.
 *
 * A screen navigating from an event handler calls `useRouter()` directly —
 * that is imperative code reacting to a click, and needs no atom. This exists
 * for the other case: an *atom* that decides the app should be somewhere else,
 * such as the run driver sending a finished workout to its result. Atoms have
 * no access to the router, so they set a request here and the same
 * `connectRoute` that reads navigations performs them.
 */
export interface NavigationRequest {
  readonly name: string
  readonly params?: Record<string, string>
  readonly replace?: boolean
}

export const navigationAtom: Atom.Writable<NavigationRequest | undefined> = Atom.make<
  NavigationRequest | undefined
>(undefined).pipe(Atom.keepAlive)

/**
 * Narrow vue-router's `RouteLocationNormalized` down to the parts the app
 * actually reads. Repeated params and array queries are collapsed to their
 * first value: no route in this app declares one, and carrying the union into
 * every consumer would buy nothing.
 */
const firstValue = (value: string | null | ReadonlyArray<string | null>): string | undefined =>
  (Array.isArray(value) ? value[0] : value) ?? undefined

/** Every name the route table declares, as a list to match a location against. */
const ROUTE_NAMES: ReadonlyArray<RouteName> = Object.values(RouteNames)

/**
 * vue-router names a location with a `string | symbol | undefined`; this app
 * names its routes in `RouteNames`. Matching against that list is what turns
 * the router's word into one of ours — a name this build does not declare
 * (a stale service worker's route table, a hand-typed URL) is no name at all.
 */
const toRouteName = (name: RouteLocationNormalizedGeneric['name']): RouteName | undefined =>
  ROUTE_NAMES.find((known) => known === name)

function toRouteSnapshot(location: RouteLocationNormalizedGeneric): RouteSnapshot {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(location.params)) {
    const first = firstValue(value)
    if (first !== undefined) params[key] = first
  }

  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(location.query)) {
    const first = firstValue(value)
    if (first !== undefined) query[key] = first
  }

  return {
    name: toRouteName(location.name),
    params,
    query,
    hideNav: location.meta.hideNav === true,
  }
}

/**
 * The bridge. One call per app instance, from `main.ts` and from the test
 * `renderApp` helper — the only two places that own both a router and a
 * registry.
 *
 * `currentRoute` is read once up front because `afterEach` fires only on
 * navigations *after* registration: `renderApp` has already pushed the initial
 * URL by the time it calls this, so without the seed its first screen would
 * render against an empty route. `main.ts` calls it before `app.use(router)`
 * instead, where `currentRoute` is still `START_LOCATION` and the seed is a
 * no-op — the initial navigation that `app.use` kicks off is caught by the
 * hook. Returns the unregister function.
 */
export function connectRoute(router: Router, registry: AtomRegistry.AtomRegistry): () => void {
  const publish = (location: RouteLocationNormalizedGeneric): void => {
    registry.set(routeAtom, toRouteSnapshot(location))
  }

  publish(router.currentRoute.value)
  const stopReading = router.afterEach(publish)

  const stopWriting = registry.subscribe(navigationAtom, (request) => {
    if (request === undefined) return
    const target = { name: request.name, params: request.params ?? {} }
    void (request.replace ? router.replace(target) : router.push(target))
    // Clear it, so navigating back to the same place later is a change the
    // subscriber sees rather than a write that dedupes to nothing.
    registry.set(navigationAtom, undefined)
  })

  return () => {
    stopReading()
    stopWriting()
  }
}
