import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useArmedAction } from '@/composables/useArmedAction'

/**
 * A composable, but nothing in it needs a DOM — it is a flag, a timeout, and
 * the scope hook that clears the timeout. `effectScope` gives us the third one
 * without mounting anything, so this belongs in the fast tier.
 */
function inScope<A>(use: () => A): { value: A; dispose: () => void } {
  const scope = effectScope()
  const value = scope.run(use)

  if (value === undefined) throw new Error('scope did not run')

  return { value, dispose: () => scope.stop() }
}

describe('useArmedAction', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('commits on the second tap, not the first', () => {
    const { value: action } = inScope(() => useArmedAction())

    expect(action.isArmed()).toBe(false)
    expect(action.armFirst()).toBe(false)
    expect(action.isArmed()).toBe(true)
    expect(action.armFirst()).toBe(true)
  })

  it('disarms once it has committed, so a third tap arms again', () => {
    const { value: action } = inScope(() => useArmedAction())

    action.armFirst()
    action.armFirst()

    expect(action.isArmed()).toBe(false)
    expect(action.armFirst()).toBe(false)
  })

  it('disarms on its own after the timeout', () => {
    const { value: action } = inScope(() => useArmedAction(3_000))

    action.armFirst()
    vi.advanceTimersByTime(2_999)
    expect(action.isArmed()).toBe(true)

    vi.advanceTimersByTime(1)
    expect(action.isArmed()).toBe(false)
    // The tap that follows a lapsed arming re-arms rather than committing —
    // otherwise a forgotten tap plus a stray one would delete something.
    expect(action.armFirst()).toBe(false)
  })

  /** Each tap restarts the window; a slow second tap is still a second tap. */
  it('gives the second tap a fresh window', () => {
    const { value: action } = inScope(() => useArmedAction(3_000))

    action.armFirst()
    vi.advanceTimersByTime(2_000)
    expect(action.armFirst()).toBe(true)
  })

  describe('keyed by row', () => {
    it('arms one row at a time', () => {
      const { value: action } = inScope(() => useArmedAction())

      action.armFirst('preset-a')
      expect(action.isArmed('preset-a')).toBe(true)

      // Reaching for a different row's button disarms the first, so the list
      // never shows two armed buttons.
      expect(action.armFirst('preset-b')).toBe(false)
      expect(action.isArmed('preset-a')).toBe(false)
      expect(action.isArmed('preset-b')).toBe(true)
    })

    it('does not let one row commit another', () => {
      const { value: action } = inScope(() => useArmedAction())

      action.armFirst('preset-a')

      expect(action.armFirst('preset-b')).toBe(false)
      expect(action.armFirst('preset-b')).toBe(true)
    })

    /**
     * Arming row A, then B, then A again must not commit A off the stale
     * timeout left over from its first arming — the bug a per-component
     * hand-rolled version has to remember to clear.
     */
    it('clears the previous row timeout when another arms', () => {
      const { value: action } = inScope(() => useArmedAction(3_000))

      action.armFirst('preset-a')
      vi.advanceTimersByTime(2_000)
      action.armFirst('preset-b')
      vi.advanceTimersByTime(1_500)

      expect(action.isArmed('preset-b')).toBe(true)
    })
  })

  /**
   * The screens that use this navigate away *while armed* — the run screen
   * replaces itself on finish. A timeout surviving that would fire into a
   * disposed scope.
   */
  it('drops its timeout when the scope goes away', () => {
    const { value: action, dispose } = inScope(() => useArmedAction(3_000))

    action.armFirst()
    dispose()

    expect(action.isArmed()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
