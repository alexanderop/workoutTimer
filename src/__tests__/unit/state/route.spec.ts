import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  connectRoute,
  hideNavigationAtom,
  navigationAtom,
  routeNameAtom,
  routeParamAtom,
  routeQueryAtom,
} from '@/state/route'
import { harness, stubRouter } from '../harness'

/**
 * `connectRoute` is the whole bridge out of vue-router's reactivity, and until
 * now nothing tested it directly — it was only ever exercised through
 * `renderApp`, which costs a Chromium boot. A memory history needs no DOM, so
 * the bridge is an ordinary Node test.
 */
let cleanup: Array<() => void> = []

afterEach(() => {
  for (const stop of cleanup) stop()
  cleanup = []
})

async function connected(initialPath: string) {
  const router = await stubRouter(initialPath)

  const app = harness()
  // Same order as main.ts and renderApp: push first, then bridge — which is
  // why `connectRoute` seeds from `currentRoute` instead of trusting afterEach.
  const disconnect = connectRoute(router, app.registry)
  cleanup.push(disconnect, () => app.dispose())

  return { router, app }
}

describe('connectRoute', () => {
  it('seeds from the route already pushed before it was registered', async () => {
    const { app } = await connected('/session/abc')

    expect(app.get(routeNameAtom)).toBe('timer-run')
    expect(app.get(routeParamAtom('id'))).toBe('abc')
    expect(app.get(hideNavigationAtom)).toBe(true)
  })

  it('follows later navigations', async () => {
    const { router, app } = await connected('/')

    expect(app.get(hideNavigationAtom)).toBe(false)
    await router.push('/history/xyz')

    expect(app.get(routeNameAtom)).toBe('session-detail')
    expect(app.get(routeParamAtom('id'))).toBe('xyz')
    expect(app.get(hideNavigationAtom)).toBe(false)
  })

  it('reads query parameters, and reports an absent one as undefined', async () => {
    const { app } = await connected('/timer/amrap?preset=p1')

    expect(app.get(routeQueryAtom('preset'))).toBe('p1')
    expect(app.get(routeQueryAtom('missing'))).toBeUndefined()
    expect(app.get(routeParamAtom('id'))).toBeUndefined()
  })

  /**
   * The reason `routeAtom` is private and the narrow atoms are what the app
   * reads. Atoms dedupe with `Object.is` and every navigation writes a *fresh*
   * snapshot object, so a consumer of the snapshot recomputes on every route
   * change. Both result screens address the same session; a spurious change to
   * "which session is this?" is what re-seeds a form and discards typing.
   */
  it('keeps a param stable across navigations that do not change it', async () => {
    const { router, app } = await connected('/session/abc')

    const ids = app.record(routeParamAtom('id'))
    const names = app.record(routeNameAtom)

    await router.push('/session/abc/result')

    expect(names).toEqual(['timer-run', 'timer-result'])
    expect(ids).toEqual(['abc'])
  })

  it('navigates when an atom asks it to, and clears the request', async () => {
    const { router, app } = await connected('/')

    app.set(navigationAtom, { name: 'session-detail', params: { id: 'from-atom' } })
    // `connectRoute` fires the push without awaiting it — a navigation is not
    // something the atom that requested it can block on.
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('session-detail'))

    expect(router.currentRoute.value.params.id).toBe('from-atom')
    // Cleared, so asking for the same destination again is a change the
    // subscriber sees rather than a write that dedupes to nothing.
    expect(app.get(navigationAtom)).toBeUndefined()
  })

  it('stops listening once disconnected', async () => {
    const { router, app } = await connected('/')
    const disconnect = cleanup[0]

    disconnect?.()
    await router.push('/history/after-disconnect')

    expect(app.get(routeNameAtom)).toBe('timer')
  })
})
