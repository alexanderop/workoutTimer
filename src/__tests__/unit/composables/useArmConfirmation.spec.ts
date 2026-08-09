import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useArmConfirmation } from '@/composables/useArmConfirmation'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useArmConfirmation', () => {
  it('confirms only the second request for the same key', () => {
    const scope = effectScope()
    const confirmation = scope.run(() => useArmConfirmation<string>())!

    expect(confirmation.requestConfirmation('delete')).toBe(false)
    expect(confirmation.isArmed('delete')).toBe(true)
    expect(confirmation.requestConfirmation('delete')).toBe(true)
    expect(confirmation.armedKey.value).toBeUndefined()

    scope.stop()
  })

  it('arms only one action at a time', () => {
    const scope = effectScope()
    const confirmation = scope.run(() => useArmConfirmation<'finish' | 'cancel'>())!

    confirmation.requestConfirmation('finish')
    confirmation.requestConfirmation('cancel')

    expect(confirmation.isArmed('finish')).toBe(false)
    expect(confirmation.isArmed('cancel')).toBe(true)

    scope.stop()
  })

  it('disarms after the window expires', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const confirmation = scope.run(() => useArmConfirmation<string>(500))!

    confirmation.requestConfirmation('delete')
    vi.advanceTimersByTime(500)

    expect(confirmation.armedKey.value).toBeUndefined()
    scope.stop()
  })

  it('cleans up its timer with the owning scope', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const scope = effectScope()
    const confirmation = scope.run(() => useArmConfirmation<string>())!
    confirmation.requestConfirmation('delete')

    scope.stop()

    expect(clearTimeoutSpy).toHaveBeenCalledOnce()
    expect(confirmation.armedKey.value).toBeUndefined()
  })
})
