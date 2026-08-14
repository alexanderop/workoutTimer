import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissToastAtom, showToastAtom, toastExpiryEffectAtom, toastsAtom } from '@/state/toast'
import { harness } from '../harness'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The toast list, its ids and its auto-dismiss window — none of which needs a
 * rendered viewport to be true. What the browser tier still owns is that
 * ToastViewport announces them: a live region, its transitions, and the fact
 * that it is mounted before its content arrives.
 */
describe('toasts', () => {
  it('shows a message and drops it when the window expires', () => {
    vi.useFakeTimers()
    const app = harness()
    app.mount(toastsAtom)
    app.mount(toastExpiryEffectAtom)

    app.set(showToastAtom, 'Saved')
    expect(app.get(toastsAtom).map((toast) => toast.message)).toEqual(['Saved'])

    vi.advanceTimersByTime(2_999)
    expect(app.get(toastsAtom)).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(app.get(toastsAtom)).toEqual([])

    app.dispose()
  })

  it('stacks messages and expires each on its own clock', () => {
    vi.useFakeTimers()
    const app = harness()
    app.mount(toastsAtom)
    app.mount(toastExpiryEffectAtom)

    app.set(showToastAtom, 'first')
    vi.advanceTimersByTime(1_000)
    app.set(showToastAtom, 'second')

    expect(app.get(toastsAtom).map((toast) => toast.message)).toEqual(['first', 'second'])

    // 3 s after the first, 2 s after the second.
    vi.advanceTimersByTime(2_000)
    expect(app.get(toastsAtom).map((toast) => toast.message)).toEqual(['second'])

    vi.advanceTimersByTime(1_000)
    expect(app.get(toastsAtom)).toEqual([])

    app.dispose()
  })

  /**
   * Two toasts with the same text are two toasts. Dismissal is by id precisely
   * so the viewport's `:key` and the close button cannot collapse them —
   * filtering by message would drop both.
   */
  it('dismisses by id, not by message', () => {
    const app = harness()
    app.mount(toastsAtom)
    app.mount(toastExpiryEffectAtom)

    app.set(showToastAtom, 'Saved')
    app.set(showToastAtom, 'Saved')
    const [first, second] = app.get(toastsAtom)
    expect(first?.id).not.toBe(second?.id)

    app.set(dismissToastAtom, first!.id)

    expect(app.get(toastsAtom)).toEqual([second])

    app.dispose()
  })

  it('starts empty in a fresh registry', () => {
    const app = harness()
    expect(app.get(toastsAtom)).toEqual([])
    app.dispose()
  })
})

/**
 * The leak the browser tier found the moment `renderApp` started disposing its
 * registry per test: a pending dismissal fired three seconds later, into a
 * registry that no longer existed. The timers belong to the atom now, so
 * unmounting the viewport is what cancels them.
 */
describe('toast expiry ownership', () => {
  /**
   * Counted against a baseline: the runner has timers of its own, so what this
   * asserts is that *these* atoms left none behind, not that the process did.
   */
  function pendingTimers(): { since: () => number } {
    const baseline = vi.getTimerCount()
    return { since: () => vi.getTimerCount() - baseline }
  }

  it('cancels pending dismissals when the viewport goes away', () => {
    vi.useFakeTimers()
    const app = harness()
    app.mount(toastsAtom)
    app.mount(toastExpiryEffectAtom)
    const timers = pendingTimers()

    app.set(showToastAtom, 'Saved')
    expect(timers.since()).toBe(1)

    app.dispose()

    // Nothing left to fire — and if something were, it would reach a disposed
    // registry and throw three seconds later, where no test is looking.
    expect(timers.since()).toBe(0)
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow()
  })

  it('drops the timer of a toast dismissed by hand', () => {
    vi.useFakeTimers()
    const app = harness()
    app.mount(toastsAtom)
    app.mount(toastExpiryEffectAtom)
    const timers = pendingTimers()

    app.set(showToastAtom, 'Saved')
    app.set(dismissToastAtom, app.get(toastsAtom)[0]!.id)

    expect(timers.since()).toBe(0)

    app.dispose()
  })
})
