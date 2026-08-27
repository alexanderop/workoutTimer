import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addSessionRound,
  createSession,
  resetDatabase,
  sessionMutation,
  type NewSession,
  type TimerConfig,
  type WorkoutSession,
} from '@/db'
import { timerCueAtom, timerRunDriverAtom } from '@/features/timer/runDriver'
import { connectRoute } from '@/state/route'
import { sessionListAtom } from '@/state/timerData'
import { harness, stubRouter } from '../../harness'
import type { Router } from 'vue-router'

/**
 * The running timer's state machine, driven from a registry.
 *
 * Its own comment said "a test can drive it by seeding a registry", and until
 * now nothing did — the file had no coverage at any tier, which is how the
 * EMOM round cue came to be missing and how the driver came to depend on a
 * view mounting the atom it writes.
 *
 * Two things the harness here is deliberately strict about:
 *
 * 1. **Nothing mounts `sessionMutation`.** `TimerRunView` happens to, for its
 *    Pause and Finish buttons, and writing an unmounted function atom is
 *    silently a no-op — so the driver's transitions used to work by borrowing
 *    a subscription that belongs to two unrelated buttons. Every write
 *    asserted below has to land with only the driver mounted.
 * 2. **Only `Date` is faked.** `clockAtom`'s real 100 ms interval keeps
 *    running and republishes whatever `Date.now()` now says, so moving the
 *    workout's clock is one `setSystemTime` call — and IndexedDB, promises and
 *    `vi.waitFor` all still work normally.
 */
const AMRAP: TimerConfig = { mode: 'amrap', durationMs: 600_000 }

interface Driven {
  readonly app: ReturnType<typeof harness>
  readonly router: Router
  readonly session: WorkoutSession
  readonly stored: () => WorkoutSession
  readonly dispose: () => void
}

/** Seed a workout, then open its screen in a registry that has never written. */
async function drive(
  config: TimerConfig,
  countdownDurationMs: NewSession['countdownDurationMs'] = 0,
  mount: ReadonlyArray<Parameters<ReturnType<typeof harness>['mount']>[0]> = [],
): Promise<Driven> {
  const seeding = harness()
  seeding.mount(sessionListAtom)
  seeding.write(
    sessionMutation,
    Effect.orDie(createSession({ config, workoutNotes: '', countdownDurationMs })),
  )
  await vi.waitFor(() => expect(seeding.get(sessionListAtom)).toHaveLength(1))
  const session = seeding.get(sessionListAtom)[0]!
  seeding.dispose()

  const router = await stubRouter(`/session/${session.id}`)
  const app = harness()
  const disconnect = connectRoute(router, app.registry)
  app.mount(sessionListAtom)
  app.mount(timerRunDriverAtom)
  for (const atom of mount) app.mount(atom)
  await vi.waitFor(() => expect(app.get(sessionListAtom)).toHaveLength(1))

  return {
    app,
    router,
    session,
    stored: () => app.get(sessionListAtom)[0]!,
    dispose: () => {
      disconnect()
      app.dispose()
    },
  }
}

/** Move the workout's clock. Only `Date` is faked; the interval stays real. */
function clockAt(milliseconds: number): void {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(milliseconds)
}

beforeEach(async () => {
  vi.useRealTimers()
  await resetDatabase()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the countdown', () => {
  it('starts the workout when wall-clock time reaches startedAt', async () => {
    const driven = await drive(AMRAP, 3_000)
    expect(driven.stored().status).toBe('countdown')

    clockAt(driven.session.startedAt + 50)

    await vi.waitFor(() => expect(driven.stored().status).toBe('running'))

    driven.dispose()
  })

  it('leaves it counting down until then', async () => {
    const driven = await drive(AMRAP, 3_000)

    clockAt(driven.session.startedAt - 500)
    await vi.waitFor(() => expect(driven.stored().updatedAt).toBeGreaterThan(0))

    expect(driven.stored().status).toBe('countdown')

    driven.dispose()
  })
})

describe('the end of a workout', () => {
  it('finishes an AMRAP at its duration, and says why', async () => {
    const driven = await drive(AMRAP)

    clockAt(driven.session.startedAt + 600_000)

    await vi.waitFor(() => expect(driven.stored().status).toBe('completed'))
    expect(driven.stored().finishReason).toBe('endpoint')

    driven.dispose()
  })

  /** For Time is the one mode whose automatic end is a cap rather than an endpoint. */
  it('finishes a capped For Time at the cap', async () => {
    const driven = await drive({ mode: 'forTime', timeCapMs: 300_000 })

    clockAt(driven.session.startedAt + 300_000)

    await vi.waitFor(() => expect(driven.stored().status).toBe('completed'))
    expect(driven.stored().finishReason).toBe('timeCap')

    driven.dispose()
  })

  it('leaves an uncapped For Time running', async () => {
    const driven = await drive({ mode: 'forTime' })

    clockAt(driven.session.startedAt + 12 * 60 * 60_000)
    await vi.waitFor(() => expect(driven.stored().updatedAt).toBeGreaterThan(0))

    expect(driven.stored().status).toBe('running')

    driven.dispose()
  })

  /**
   * Navigation follows the *data*: the driver sends the user to the result
   * screen when it sees a completed row, whoever wrote it. That is what let
   * the old `transitionPending` flag go.
   */
  it('sends the user to the result screen once the row is completed', async () => {
    const driven = await drive(AMRAP)

    clockAt(driven.session.startedAt + 600_000)

    await vi.waitFor(() => expect(driven.router.currentRoute.value.name).toBe('timer-result'))
    expect(driven.router.currentRoute.value.params.id).toBe(driven.session.id)

    driven.dispose()
  })
})

/**
 * The audible half. `emitTimerCue` reaches for `navigator.vibrate` first and
 * every other channel is off or unavailable in Node — no AudioContext, and
 * spoken countdowns default to off — so a stubbed `vibrate` counts cues.
 */
describe('cues', () => {
  let vibrate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
  })

  /**
   * The bug this covers: EMOM's phase is `work` from the first second to the
   * last, so a cue that only watches the phase never fires for it. The athlete
   * heard the 3-2-1 and then silence at the exact moment the round turned
   * over — every minute, in the mode built to be used eyes-free.
   *
   * The jump is from mid-round to mid-round so the last-three-seconds
   * countdown cue cannot account for the call.
   */
  it('marks an EMOM round boundary', async () => {
    const driven = await drive({ mode: 'emom', intervalMs: 60_000, rounds: 10 }, 0, [timerCueAtom])

    clockAt(driven.session.startedAt + 10_000)
    await vi.waitFor(() => expect(vibrate).not.toHaveBeenCalled())

    clockAt(driven.session.startedAt + 70_000)

    await vi.waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1))

    driven.dispose()
  })

  /**
   * Tabata reaches the same boundary through a phase change, which is already
   * cued — so the round cue must not fire as well and buzz twice.
   */
  it('marks a Tabata work/rest turn exactly once', async () => {
    const driven = await drive({ mode: 'tabata', workMs: 20_000, restMs: 10_000, rounds: 8 }, 0, [
      timerCueAtom,
    ])

    clockAt(driven.session.startedAt + 10_000)
    await vi.waitFor(() => expect(vibrate).not.toHaveBeenCalled())

    clockAt(driven.session.startedAt + 25_000)

    await vi.waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1))

    driven.dispose()
  })

  /**
   * In AMRAP and For Time a "round" is a split the athlete tapped, and the tap
   * already cues itself from the write that recorded it — so the driver has
   * nothing to add. Cueing here would confirm a split twice, including one the
   * repository debounced away.
   */
  it('says nothing when a tapped split changes the round count', async () => {
    const driven = await drive(AMRAP, 0, [timerCueAtom])

    clockAt(driven.session.startedAt + 10_000)
    await vi.waitFor(() => expect(driven.stored().status).toBe('running'))

    driven.app.write(sessionMutation, Effect.orDie(addSessionRound(driven.session.id, 10_000)))
    await vi.waitFor(() => expect(driven.stored().rounds).toHaveLength(1))

    expect(vibrate).not.toHaveBeenCalled()

    driven.dispose()
  })
})
