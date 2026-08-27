import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from '@/db'
import { emitTimerCue } from '@/features/timer/timerFeedback'

/**
 * What a cue actually does, per channel and per preference.
 *
 * Nothing tested this: the module was named by an architecture boundary check
 * and by nothing else. It is where every "the workout said something" ends up,
 * and each channel is independently gated — a settings flag, a capability the
 * browser may not have, an AudioContext that only exists after a gesture — so
 * the ways it can go quiet are exactly the ways it can go wrong.
 *
 * There is no AudioContext in Node, which is the same state the app is in
 * before the user's first gesture: every assertion below is about the haptic
 * and spoken channels, and the tone is simply absent.
 */
const settings = (patch: Partial<TimerSettings> = {}): TimerSettings => ({
  ...DEFAULT_TIMER_SETTINGS,
  ...patch,
})

let vibrate: ReturnType<typeof vi.fn>

beforeEach(() => {
  vibrate = vi.fn()
  vi.stubGlobal('navigator', { vibrate })
})

describe('haptics', () => {
  it('gives the end of a workout its own pattern', () => {
    emitTimerCue(settings(), 'complete')

    expect(vibrate).toHaveBeenCalledWith([100, 60, 160])
  })

  it('buzzes a recorded split harder than a phase or a countdown tick', () => {
    emitTimerCue(settings(), 'round')
    emitTimerCue(settings(), 'phase')
    emitTimerCue(settings(), 'countdown', '3')

    expect(vibrate.mock.calls).toEqual([[60], [35], [35]])
  })

  it('stays still when the user has turned haptics off', () => {
    emitTimerCue(settings({ hapticsEnabled: false }), 'complete')

    expect(vibrate).not.toHaveBeenCalled()
  })

  /** A browser without the API is not a failure — the other channels still run. */
  it('survives a device that cannot vibrate', () => {
    vi.stubGlobal('navigator', {})

    expect(() => emitTimerCue(settings(), 'complete')).not.toThrow()
  })
})

describe('the spoken countdown', () => {
  let speak: ReturnType<typeof vi.fn>
  let cancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    speak = vi.fn()
    cancel = vi.fn()
    vi.stubGlobal('window', { speechSynthesis: { speak, cancel } })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(readonly text: string) {}
      },
    )
  })

  it('speaks the number it was handed, once the user has asked for it', () => {
    emitTimerCue(settings({ spokenCountdownEnabled: true }), 'countdown', '3')

    expect(speak).toHaveBeenCalledTimes(1)
    expect(speak.mock.calls[0]?.[0]).toMatchObject({ text: '3' })
  })

  /** "2" must interrupt "3", not queue behind it — the numbers are a second apart. */
  it('cancels whatever is still being said', () => {
    emitTimerCue(settings({ spokenCountdownEnabled: true }), 'countdown', '2')

    expect(cancel).toHaveBeenCalled()
  })

  it('says nothing for any other kind of cue, or when the setting is off', () => {
    emitTimerCue(settings({ spokenCountdownEnabled: true }), 'phase')
    emitTimerCue(settings({ spokenCountdownEnabled: true }), 'complete')
    emitTimerCue(settings({ spokenCountdownEnabled: false }), 'countdown', '3')

    expect(speak).not.toHaveBeenCalled()
  })

  /** The default is off: a countdown that talks unasked is a surprise in a gym. */
  it('is off by default', () => {
    expect(DEFAULT_TIMER_SETTINGS.spokenCountdownEnabled).toBe(false)
  })
})
