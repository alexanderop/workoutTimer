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
 * before the user's first gesture: the haptic assertions run without one and
 * the tone is simply absent. The voice needs a context to decode its clips, so
 * its block brings a fake one.
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
    emitTimerCue(settings(), 'countdown', 'three')

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

describe('the voice coach', () => {
  /**
   * Just enough Web Audio to follow one clip from fetch to speaker: the
   * context decodes whatever bytes it is given into a token, and every buffer
   * source it creates is kept so a test can ask which were started or stopped.
   */
  const sources: Array<{ buffer: unknown; start: () => void; stop: () => void }> = []
  const gains: Array<{ gain: { value: number } }> = []

  class FakeAudioContext {
    destination = {}
    currentTime = 0
    resume = vi.fn()
    decodeAudioData = vi.fn((bytes: string) => Promise.resolve({ decoded: bytes }))
    createBufferSource() {
      const source = { buffer: undefined, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      sources.push(source)
      return source
    }
    createGain() {
      const node = {
        connect: vi.fn(),
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      }
      gains.push(node)
      return node
    }
    createOscillator() {
      return { frequency: {}, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
    }
  }

  let fetched: string[]

  /** A fresh module per test: the context and the decoded clips are module state. */
  async function unlocked() {
    vi.resetModules()
    const feedback = await import('@/features/timer/timerFeedback')
    feedback.unlockTimerAudio()
    await vi.waitFor(() => expect(fetched.length).toBeGreaterThan(0))
    // Let every fetch → decode → store chain settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    return feedback
  }

  beforeEach(() => {
    sources.length = 0
    gains.length = 0
    fetched = []
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetched.push(url)
        return Promise.resolve({
          ok: !url.includes('halfway'),
          arrayBuffer: () => Promise.resolve(url),
        })
      }),
    )
  })

  const voiceOn = (patch: Partial<TimerSettings> = {}) =>
    settings({ spokenCountdownEnabled: true, soundEnabled: false, ...patch })

  it('fetches every clip once, however often the audio is unlocked', async () => {
    const feedback = await unlocked()
    feedback.unlockTimerAudio()

    expect(fetched).toContain('/voice/ten-seconds.mp3')
    expect(fetched).toContain('/voice/round-20.mp3')
    expect(new Set(fetched).size).toBe(fetched.length)
  })

  it('plays the clip it was handed, once the user has asked for a voice', async () => {
    const { emitTimerCue: emit } = await unlocked()

    emit(voiceOn(), 'voice', 'ten-seconds')

    expect(sources).toHaveLength(1)
    expect(sources[0]?.buffer).toEqual({ decoded: '/voice/ten-seconds.mp3' })
    expect(sources[0]?.start).toHaveBeenCalledTimes(1)
  })

  /** "Two" must interrupt "Three", not play over it — the numbers are a second apart. */
  it('cuts off whatever is still being said', async () => {
    const { emitTimerCue: emit } = await unlocked()

    emit(voiceOn(), 'countdown', 'three')
    emit(voiceOn(), 'countdown', 'two')

    expect(sources[0]?.stop).toHaveBeenCalledTimes(1)
    expect(sources[1]?.stop).not.toHaveBeenCalled()
  })

  it('speaks at the chosen volume, and at full volume when the beeps are turned to zero', async () => {
    const { emitTimerCue: emit } = await unlocked()

    emit(voiceOn({ soundVolume: 0.4 }), 'voice', 'rest')
    emit(voiceOn({ soundVolume: 0 }), 'voice', 'rest')

    expect(gains.map((node) => node.gain.value)).toEqual([0.4, 1])
  })

  it('says nothing when the setting is off, or when the cue carries no line', async () => {
    const { emitTimerCue: emit } = await unlocked()

    emit(voiceOn({ spokenCountdownEnabled: false }), 'phase', 'rest')
    emit(voiceOn(), 'phase')

    expect(sources).toHaveLength(0)
  })

  /** A clip that failed to load is a silent line, not a thrown error mid-workout. */
  it('stays silent for a clip that never arrived', async () => {
    const { emitTimerCue: emit } = await unlocked()

    expect(() => emit(voiceOn(), 'voice', 'halfway')).not.toThrow()
    expect(sources).toHaveLength(0)
  })

  /** A line between two beeps is only a line: no buzz and no tone of its own. */
  it('neither buzzes nor beeps for a voice-only cue', async () => {
    const { emitTimerCue: emit } = await unlocked()

    emit(voiceOn({ soundEnabled: true }), 'voice', 'halfway')

    expect(vibrate).not.toHaveBeenCalled()
    expect(gains).toHaveLength(0)
  })

  it('still buzzes for a cue that carries a line', async () => {
    const { emitTimerCue: emit } = await unlocked()

    emit(voiceOn(), 'phase', 'rest')

    expect(vibrate).toHaveBeenCalledWith(35)
  })

  /** The default is off: a timer that talks unasked is a surprise in a gym. */
  it('is off by default', () => {
    expect(DEFAULT_TIMER_SETTINGS.spokenCountdownEnabled).toBe(false)
  })
})
