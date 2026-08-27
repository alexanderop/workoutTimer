import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSession,
  finishSession,
  resetDatabase,
  sessionMutation,
  settingsMutation,
  updateTimerSettings,
  type TimerConfig,
} from '@/db'
import { wakeLockEffectAtom } from '@/features/timer/wakeLock'
import { connectRoute } from '@/state/route'
import { sessionListAtom } from '@/state/timerData'
import { harness, stubRouter } from '../../harness'

/**
 * The screen wake lock, as the atom that owns it rather than as a screen.
 *
 * The bug this replaced was a race between two triggers acquiring overlapping
 * locks, and the shape of the fix is that the lock is a *finalizer* — held
 * while the read that requested it is current, released the moment it is not.
 * That is what these assertions are about: acquire on a live workout, release
 * when the answer changes, and never acquire on a browser that has no API.
 */
const AMRAP: TimerConfig = { mode: 'amrap', durationMs: 600_000 }

let release: ReturnType<typeof vi.fn>
let request: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await resetDatabase()
  release = vi.fn().mockResolvedValue(undefined)
  request = vi.fn().mockResolvedValue({ release })
})

/** A live workout on its own screen, with the lock atom mounted. */
async function onTheTimerScreen(): Promise<{
  app: ReturnType<typeof harness>
  sessionId: string
  dispose: () => void
}> {
  const seeding = harness()
  seeding.mount(sessionListAtom)
  seeding.write(
    sessionMutation,
    Effect.orDie(createSession({ config: AMRAP, workoutNotes: '', countdownDurationMs: 0 })),
  )
  await vi.waitFor(() => expect(seeding.get(sessionListAtom)).toHaveLength(1))
  const sessionId = seeding.get(sessionListAtom)[0]!.id
  seeding.dispose()

  const router = await stubRouter(`/session/${sessionId}`)
  const app = harness()
  const disconnect = connectRoute(router, app.registry)
  app.mount(sessionListAtom)
  await vi.waitFor(() => expect(app.get(sessionListAtom)).toHaveLength(1))
  app.mount(wakeLockEffectAtom)

  return {
    app,
    sessionId,
    dispose: () => {
      disconnect()
      app.dispose()
    },
  }
}

describe('the wake lock', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { wakeLock: { request } })
  })

  it('is held while a workout is on screen', async () => {
    const screen = await onTheTimerScreen()

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'))

    screen.dispose()
  })

  /** Leaving the screen is what releases it — the finalizer, not a watcher. */
  it('is released when the screen goes away', async () => {
    const screen = await onTheTimerScreen()
    await vi.waitFor(() => expect(request).toHaveBeenCalled())

    screen.dispose()

    await vi.waitFor(() => expect(release).toHaveBeenCalled())
  })

  /**
   * The result screen stays open on a finished workout, and must not keep the
   * phone awake to show it.
   */
  it('is released once the workout is over', async () => {
    const screen = await onTheTimerScreen()
    await vi.waitFor(() => expect(request).toHaveBeenCalled())

    screen.app.write(sessionMutation, Effect.orDie(finishSession(screen.sessionId, 'manual')))

    await vi.waitFor(() => expect(release).toHaveBeenCalled())

    screen.dispose()
  })

  it('is not asked for when the user has turned it off', async () => {
    const screen = await onTheTimerScreen()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    screen.app.write(settingsMutation, Effect.orDie(updateTimerSettings({ keepAwake: false })))
    await vi.waitFor(() => expect(release).toHaveBeenCalled())

    expect(request).toHaveBeenCalledTimes(1)

    screen.dispose()
  })
})

/** Safari without the API, and a request the browser simply refuses. */
describe('a browser that will not hold one', () => {
  it('does nothing at all when there is no wakeLock API', async () => {
    vi.stubGlobal('navigator', {})
    const screen = await onTheTimerScreen()

    expect(request).not.toHaveBeenCalled()

    screen.dispose()
  })

  it('swallows a refused request rather than surfacing it', async () => {
    const refused = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { wakeLock: { request: refused } })
    const screen = await onTheTimerScreen()

    await vi.waitFor(() => expect(refused).toHaveBeenCalled())

    screen.dispose()
  })
})
