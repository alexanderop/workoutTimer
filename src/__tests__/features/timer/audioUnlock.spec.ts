import { AtomRegistry } from '@effect/atom-vue'
import { describe, expect, it, vi } from 'vitest'
import { audioUnlockEffectAtom } from '@/features/timer/audioUnlock'

/**
 * Subscribing is what runs the atom's read, and the read is what attaches the
 * listeners — this is the run screen's `onMounted` without a screen to own it,
 * which is the whole point of the atom.
 *
 * The assertions are about `document`, not about sound. `unlockTimerAudio`
 * constructs an AudioContext and memoises it at module scope, so "did audio
 * unlock?" is answerable once per page at best; and its export cannot be spied
 * in browser mode, where an ES module namespace is not configurable. What
 * moved out of the screen was the *lifecycle* — attach on mount, `once`,
 * detach on unmount — so that is what is checked here, against the real
 * `document` this tier provides.
 */
function mount(): () => void {
  const registry = AtomRegistry.make()
  const stop = registry.subscribe(audioUnlockEffectAtom, () => {}, { immediate: true })
  return () => {
    stop()
    registry.dispose()
  }
}

const GESTURES = ['pointerdown', 'keydown']

describe('audioUnlockEffectAtom', () => {
  it('listens for the first gesture of either kind', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const stop = mount()

    const registered = add.mock.calls.filter(([type]) => GESTURES.includes(type))

    expect(registered.map(([type]) => type)).toEqual(GESTURES)
    for (const [, , options] of registered) {
      expect(options).toMatchObject({ once: true, passive: true })
    }

    stop()
  })

  /**
   * `once: true` removes only the listener that fired, so a tap used to leave
   * the `keydown` listener on `document` for the life of the screen. The
   * handler disarms both, which is what this asserts — before `stop()`, so a
   * finalizer that happens to clean up cannot stand in for it.
   */
  it('drops the other gesture listener too, on the first gesture', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const stop = mount()

    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    const removed = remove.mock.calls.filter(([type]) => GESTURES.includes(type))
    expect(removed.map(([type]) => type).sort()).toEqual([...GESTURES].sort())

    stop()
  })

  /**
   * The finalizer, which is the half `onBeforeUnmount` used to carry: leaving
   * the screen before any gesture arrives must not leave a listener on
   * `document` waiting to fire into a disposed registry.
   */
  it('stops listening when the last subscriber goes', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const stop = mount()

    expect(remove.mock.calls.filter(([type]) => GESTURES.includes(type))).toHaveLength(0)

    stop()

    const removed = remove.mock.calls.filter(([type]) => GESTURES.includes(type))
    expect(removed.map(([type]) => type)).toEqual(GESTURES)
  })

  it('leaves no listener of its own behind on a real gesture', () => {
    const stop = mount()
    // A real event through the real document: nothing here may throw, and the
    // `once` registration is what makes a second gesture a no-op.
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    stop()
  })
})
