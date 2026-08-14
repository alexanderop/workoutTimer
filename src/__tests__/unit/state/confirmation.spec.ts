import { AtomRegistry } from '@effect/atom-vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  armedConfirmationAtom,
  disarmConfirmationIn,
  requestConfirmationIn,
} from '@/state/confirmation'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * There is no composable any more: a view reads `armedConfirmationAtom(scope)`
 * with `useAtomValue` and calls `requestConfirmationIn` in its click handler,
 * and the arming rules — one key at a time, a self-disarming window, a timer
 * that dies with its last subscriber — all live here. A registry is the whole
 * harness; there is no component and no `effectScope`.
 */
function mount(scope: string, registry = AtomRegistry.make()) {
  const atom = armedConfirmationAtom(scope)
  // Subscribing is what runs the read, and the read is what gives the timeout
  // a way to write back.
  const unsubscribe = registry.subscribe(atom, () => {}, { immediate: true })

  return {
    armed: () => registry.get(atom),
    arm: (key: string | undefined) => registry.set(atom, key),
    unsubscribe,
  }
}

describe('armedConfirmationAtom', () => {
  it('holds the key it was armed with', () => {
    const confirmation = mount('holds')

    expect(confirmation.armed()).toBeUndefined()
    confirmation.arm('delete')
    expect(confirmation.armed()).toBe('delete')

    confirmation.unsubscribe()
  })

  it('arms only one action at a time', () => {
    const confirmation = mount('one-at-a-time')

    confirmation.arm('finish')
    confirmation.arm('cancel')

    expect(confirmation.armed()).toBe('cancel')

    confirmation.unsubscribe()
  })

  it('disarms after the window expires', () => {
    vi.useFakeTimers()
    const confirmation = mount('expiry')

    confirmation.arm('delete')
    vi.advanceTimersByTime(3_000)

    expect(confirmation.armed()).toBeUndefined()

    confirmation.unsubscribe()
  })

  it('disarms and clears its timer when the last subscriber goes away', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const confirmation = mount('cleanup')

    confirmation.arm('delete')
    confirmation.unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(clearTimeoutSpy).toHaveBeenCalled()
    // Leaving a screen with a delete primed and coming back must not find it
    // still primed — the registry outlives the subscription, so the teardown
    // has to say so.
    expect(confirmation.armed()).toBeUndefined()
  })

  /**
   * A family memoizes one atom *object* per key at module scope, so two
   * registries asking for the same scope get the same object. Anything the
   * factory closed over would be shared between them: a `let timer` there made
   * the second registry's read overwrite the first's disarm callback, and the
   * expiry then fired into the wrong registry — leaving the first armed
   * forever. Every screen uses a fixed scope string and every browser test
   * gets a fresh registry, so this is the case that has to hold.
   */
  it('keeps two registries on the same scope apart', () => {
    vi.useFakeTimers()
    const first = mount('shared')
    const second = mount('shared')

    first.arm('cancel')
    expect(first.armed()).toBe('cancel')
    expect(second.armed()).toBeUndefined()

    vi.advanceTimersByTime(3_000)

    expect(first.armed()).toBeUndefined()

    first.unsubscribe()
    second.unsubscribe()
  })
})

/**
 * The read-then-write rule itself, which used to live in `useArmConfirmation`
 * and so could only be reached by rendering one of the three screens that
 * called it. It takes a registry rather than returning a setter because the
 * caller needs the answer inside the click handler that asked.
 */
describe('requestConfirmationIn', () => {
  it('arms on the first request and confirms on the second', () => {
    const registry = AtomRegistry.make()
    const stop = registry.subscribe(armedConfirmationAtom('run'), () => {}, { immediate: true })

    expect(requestConfirmationIn(registry, 'run', 'finish')).toBe(false)
    expect(registry.get(armedConfirmationAtom('run'))).toBe('finish')

    expect(requestConfirmationIn(registry, 'run', 'finish')).toBe(true)
    // Confirmed means spent: the next tap starts over rather than firing again.
    expect(registry.get(armedConfirmationAtom('run'))).toBeUndefined()

    stop()
  })

  it('replaces a different armed action instead of confirming it', () => {
    const registry = AtomRegistry.make()
    const stop = registry.subscribe(armedConfirmationAtom('run'), () => {}, { immediate: true })

    requestConfirmationIn(registry, 'run', 'finish')

    expect(requestConfirmationIn(registry, 'run', 'cancel')).toBe(false)
    expect(registry.get(armedConfirmationAtom('run'))).toBe('cancel')

    stop()
  })

  it('keeps scopes independent', () => {
    const registry = AtomRegistry.make()
    const stops = ['run', 'presets'].map((scope) =>
      registry.subscribe(armedConfirmationAtom(scope), () => {}, { immediate: true }),
    )

    requestConfirmationIn(registry, 'run', 'delete')

    expect(requestConfirmationIn(registry, 'presets', 'delete')).toBe(false)
    expect(registry.get(armedConfirmationAtom('run'))).toBe('delete')

    for (const stop of stops) stop()
  })

  it('disarms a scope outright', () => {
    const registry = AtomRegistry.make()
    const stop = registry.subscribe(armedConfirmationAtom('run'), () => {}, { immediate: true })

    requestConfirmationIn(registry, 'run', 'finish')
    disarmConfirmationIn(registry, 'run')

    expect(registry.get(armedConfirmationAtom('run'))).toBeUndefined()

    stop()
  })
})
