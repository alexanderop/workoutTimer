import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canInstallAtom,
  deferredPromptAtom,
  dismissInstallHintAtom,
  hintVisibleAtom,
} from '@/state/install'
import { bannerVisibleAtom } from '@/state/pwa'
import { needRefreshAtom } from '@/state/swUpdate'
import { harness } from '../harness'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The two banners share one strip above the tab bar, and which of them gets it
 * is a rule about two booleans — so it is four cases in Node, not four renders
 * in Chromium.
 *
 * Standing the install side up needs exactly one write: `deferredPromptAtom`.
 * Everything else in the eligibility chain reads a browser API that degrades to
 * its default outside a browser (`localStorage` → "not dismissed",
 * `matchMedia('(display-mode: standalone)')` → false), which is the same reason
 * these modules are importable here at all.
 */
// SAFETY: nothing reads this event. `deferredPromptAtom` only has to hold
// *something* for the install chain to consider itself armed, and every
// property the real event carries is the browser's business, not this test's.
const captured = {} as BeforeInstallPromptEvent

function installable() {
  vi.useFakeTimers()
  const app = harness()
  app.mount(bannerVisibleAtom)
  app.mount(hintVisibleAtom)
  app.set(deferredPromptAtom, captured)
  return app
}

describe('install eligibility', () => {
  it('can install once the browser has offered a prompt', () => {
    const app = installable()

    expect(app.get(canInstallAtom)).toBe(true)

    app.dispose()
  })

  /**
   * The delay is the point of `hintVisibleAtom` — a banner that lands on top of
   * the first paint is the thing it exists to avoid.
   */
  it('holds the hint back for two seconds', () => {
    const app = installable()

    expect(app.get(hintVisibleAtom)).toBe(false)

    vi.advanceTimersByTime(1_999)
    expect(app.get(hintVisibleAtom)).toBe(false)

    vi.advanceTimersByTime(1)
    expect(app.get(hintVisibleAtom)).toBe(true)

    app.dispose()
  })

  it('cancels the pending hint when it stops being eligible', () => {
    const app = installable()

    vi.advanceTimersByTime(1_000)
    app.set(dismissInstallHintAtom, undefined)
    vi.advanceTimersByTime(5_000)

    expect(app.get(hintVisibleAtom)).toBe(false)

    app.dispose()
  })

  it('hides an already-shown hint when it is dismissed', () => {
    const app = installable()

    vi.advanceTimersByTime(2_000)
    expect(app.get(hintVisibleAtom)).toBe(true)

    app.set(dismissInstallHintAtom, undefined)

    expect(app.get(hintVisibleAtom)).toBe(false)

    app.dispose()
  })
})

describe('banner arbitration', () => {
  it('shows the install banner when there is no update waiting', () => {
    const app = installable()
    vi.advanceTimersByTime(2_000)

    expect(app.get(bannerVisibleAtom)).toBe(true)

    app.dispose()
  })

  /**
   * An available update wins: it is the one the user cannot act on later.
   */
  it('yields to an available update', () => {
    const app = installable()
    vi.advanceTimersByTime(2_000)

    app.set(needRefreshAtom, true)

    expect(app.get(bannerVisibleAtom)).toBe(false)

    app.dispose()
  })

  it('comes back when the update banner is dismissed', () => {
    const app = installable()
    vi.advanceTimersByTime(2_000)

    app.set(needRefreshAtom, true)
    app.set(needRefreshAtom, false)

    expect(app.get(bannerVisibleAtom)).toBe(true)

    app.dispose()
  })

  it('shows nothing when neither has anything to say', () => {
    vi.useFakeTimers()
    const app = harness()
    app.mount(bannerVisibleAtom)

    vi.advanceTimersByTime(5_000)

    expect(app.get(bannerVisibleAtom)).toBe(false)

    app.dispose()
  })
})
