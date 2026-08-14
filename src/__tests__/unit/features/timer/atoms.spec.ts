import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPreset,
  createSession,
  finishSession,
  pauseSession,
  presetMutation,
  resetDatabase,
  sessionMutation,
  settingsMutation,
  updateTimerSettings,
  type DbServices,
  type NewSession,
  type PresetDraft,
  type TimerConfig,
  type WorkoutSession,
} from '@/db'
import {
  activeSessionAtom,
  currentSessionAtom,
  currentSessionResultAtom,
  hasActiveSessionAtom,
  historyFilterAtom,
  historySessionsAtom,
  keepAwakeAtom,
  recentPresetsAtom,
  resultNotesAtom,
  runDerivedTimerAtom,
  sortedPresetsAtom,
} from '@/features/timer/atoms'
import { connectRoute } from '@/state/route'
import { presetListAtom, sessionListAtom } from '@/state/timerData'
import { harness, stubRouter } from '../../harness'

/**
 * Everything the timer screens read, tested the way the module's own comment
 * says it should be: seed the data, read the derivation, never mount a
 * component. Until now none of it had a spec at this tier — it was covered only
 * transitively, through `renderApp` and a Chromium boot.
 */
const AMRAP: TimerConfig = { mode: 'amrap', durationMs: 60_000 }

const sessionDraft = (patch: Partial<NewSession> = {}): NewSession => ({
  config: AMRAP,
  workoutNotes: '',
  countdownDurationMs: 0,
  ...patch,
})

const presetDraft = (name: string): PresetDraft => ({ name, config: AMRAP, workoutNotes: '' })

type App = ReturnType<typeof harness>

beforeEach(async () => {
  await resetDatabase()
})

afterEach(() => {
  vi.useRealTimers()
})

const mutate = (
  app: App,
  mutation: typeof sessionMutation,
  program: Effect.Effect<unknown, unknown, DbServices>,
): void => app.write(mutation, Effect.orDie(program))

/** A registry with the route bridged in, sitting on `path`. */
async function appAt(path: string): Promise<App & { dispose: () => void }> {
  const router = await stubRouter(path)
  const app = harness()
  const disconnect = connectRoute(router, app.registry)
  const dispose = app.dispose

  return Object.assign(app, {
    dispose: (): void => {
      disconnect()
      dispose()
    },
  })
}

/** One live workout in the database, and the atoms mounted to see it. */
async function withLiveSession(path = '/'): Promise<{ app: App; session: WorkoutSession }> {
  const app = await appAt(path)
  app.mount(sessionListAtom)
  mutate(app, sessionMutation, createSession(sessionDraft()))
  await vi.waitFor(() => expect(app.get(sessionListAtom)).toHaveLength(1))
  return { app, session: app.get(sessionListAtom)[0]! }
}

describe('the resumable workout', () => {
  it('finds a running session, and stops finding it once it is over', async () => {
    const { app, session } = await withLiveSession()

    expect(app.get(activeSessionAtom)?.id).toBe(session.id)
    expect(app.get(hasActiveSessionAtom)).toBe(true)

    mutate(app, sessionMutation, finishSession(session.id, 'manual'))

    await vi.waitFor(() => expect(app.get(hasActiveSessionAtom)).toBe(false))
    expect(app.get(activeSessionAtom)).toBeUndefined()

    app.dispose()
  })

  /**
   * A paused workout is still on screen and still resumable — the three live
   * statuses are `countdown`, `running` and `paused`, and forgetting the last
   * one is how "Resume timer" disappears the moment a user takes a breather.
   */
  it('still counts a paused workout as live', async () => {
    const { app, session } = await withLiveSession()

    mutate(app, sessionMutation, pauseSession(session.id))

    await vi.waitFor(() => expect(app.get(sessionListAtom)[0]?.status).toBe('paused'))
    expect(app.get(hasActiveSessionAtom)).toBe(true)

    app.dispose()
  })

  it('reports no active workout on an empty database', async () => {
    const app = await appAt('/')
    app.mount(sessionListAtom)

    expect(app.get(hasActiveSessionAtom)).toBe(false)

    app.dispose()
  })
})

describe('history', () => {
  async function withFinished(): Promise<App> {
    const app = await appAt('/history')
    app.mount(sessionListAtom)

    for (const reason of ['manual', 'cancelled'] as const) {
      mutate(app, sessionMutation, createSession(sessionDraft()))
      await vi.waitFor(() => expect(app.get(activeSessionAtom)).toBeDefined())
      mutate(app, sessionMutation, finishSession(app.get(activeSessionAtom)!.id, reason))
      await vi.waitFor(() => expect(app.get(activeSessionAtom)).toBeUndefined())
    }

    return app
  }

  it('shows only finished workouts, and narrows by the active filter', async () => {
    const app = await withFinished()
    app.mount(historySessionsAtom)

    const statuses = (): Array<string> => app.get(historySessionsAtom).map((s) => s.status)

    expect(statuses().toSorted()).toEqual(['cancelled', 'completed'])

    app.set(historyFilterAtom, 'completed')
    expect(statuses()).toEqual(['completed'])

    app.set(historyFilterAtom, 'cancelled')
    expect(statuses()).toEqual(['cancelled'])

    app.set(historyFilterAtom, 'all')
    expect(statuses()).toHaveLength(2)

    app.dispose()
  })

  /**
   * A live workout belongs on the timer screen, not in history — the filter is
   * over *finished* statuses, and `all` means all of those, not all rows.
   */
  it('keeps a running workout out of history entirely', async () => {
    const app = await withFinished()
    app.mount(historySessionsAtom)

    mutate(app, sessionMutation, createSession(sessionDraft()))

    await vi.waitFor(() => expect(app.get(sessionListAtom)).toHaveLength(3))
    expect(app.get(historySessionsAtom)).toHaveLength(2)

    app.dispose()
  })
})

describe('presets', () => {
  it('offers at most four on the home screen, newest first', async () => {
    const app = await appAt('/')
    app.mount(presetListAtom)

    for (const name of ['one', 'two', 'three', 'four', 'five']) {
      mutate(app, presetMutation, createPreset(presetDraft(name)))
      await vi.waitFor(() =>
        expect(app.get(presetListAtom).some((p) => p.name === name)).toBe(true),
      )
    }

    expect(app.get(sortedPresetsAtom)).toHaveLength(5)
    expect(app.get(recentPresetsAtom)).toHaveLength(4)
    // Same ordering as the full list, just cut short.
    expect(app.get(recentPresetsAtom)).toEqual(app.get(sortedPresetsAtom).slice(0, 4))

    app.dispose()
  })
})

describe('the session the URL is pointing at', () => {
  it('resolves the id in the path', async () => {
    const { app, session } = await withLiveSession()
    const at = await appAt(`/session/${session.id}`)
    at.mount(sessionListAtom)
    await vi.waitFor(() => expect(at.get(sessionListAtom)).toHaveLength(1))

    expect(at.get(currentSessionAtom)?.id).toBe(session.id)

    at.dispose()
    app.dispose()
  })

  it('resolves to nothing on a route with no id, or an id that is not a row', async () => {
    const { app } = await withLiveSession()
    app.dispose()

    const home = await appAt('/')
    home.mount(sessionListAtom)
    expect(home.get(currentSessionAtom)).toBeUndefined()
    home.dispose()

    const missing = await appAt('/session/not-a-real-id')
    missing.mount(sessionListAtom)
    await vi.waitFor(() => expect(missing.get(sessionListAtom)).toHaveLength(1))
    expect(missing.get(currentSessionAtom)).toBeUndefined()
    missing.dispose()
  })
})

/**
 * The two derivations of the *same* session that must not be the same atom.
 *
 * The run screen follows the clock; the result and detail screens show what was
 * frozen at `finishedAt`. Sharing one atom would make a finished workout's
 * elapsed time creep upward while the user reads it.
 */
describe('derived timer', () => {
  it('follows the clock while the workout is live, and stops when it is not', async () => {
    const { app, session } = await withLiveSession()
    app.dispose()

    const at = await appAt(`/session/${session.id}`)
    at.mount(sessionListAtom)
    await vi.waitFor(() => expect(at.get(currentSessionAtom)).toBeDefined())

    // Fake timers only from here: the seeding above is real async I/O.
    vi.useFakeTimers()
    const ticking = at.record(runDerivedTimerAtom)

    vi.advanceTimersByTime(1_000)

    // The clock atom ticks ten times a second, so a second of it is ten
    // republishes, each with more elapsed time than the last.
    expect(ticking.length).toBeGreaterThan(1)
    expect(ticking.at(-1)!.elapsedMs).toBeGreaterThan(ticking[0]!.elapsedMs)

    at.dispose()
  })

  /**
   * `currentSessionResultAtom` derives against `finishedAt ?? Date.now()`, so
   * "frozen" is a property of a *finished* row, not of the atom — which is why
   * the assertion is that the number stops moving once the workout is over,
   * and not that the atom stops recomputing.
   */
  it('freezes a finished workout at the time it finished', async () => {
    const { app, session } = await withLiveSession()
    mutate(app, sessionMutation, finishSession(session.id, 'manual'))
    await vi.waitFor(() => expect(app.get(sessionListAtom)[0]?.status).toBe('completed'))
    app.dispose()

    const at = await appAt(`/session/${session.id}/result`)
    at.mount(sessionListAtom)
    await vi.waitFor(() => expect(at.get(currentSessionAtom)).toBeDefined())

    const first = at.get(currentSessionResultAtom)!.elapsedMs
    vi.useFakeTimers()
    vi.advanceTimersByTime(5_000)

    expect(at.get(currentSessionResultAtom)!.elapsedMs).toBe(first)

    at.dispose()
  })
})

/**
 * The bug this atom exists to prevent, as a test.
 *
 * A `watch` on the session re-seeded the field on every change to that row's
 * identity, so any write that refreshed the sessions table discarded what the
 * user had typed. The rule is now stated rather than implied: seed from disk
 * once, when the row first arrives, and never again once anything has been
 * written to the field.
 */
describe('result notes', () => {
  it('seeds from the stored row when it arrives', async () => {
    const { app, session } = await withLiveSession()
    app.dispose()

    const at = await appAt(`/session/${session.id}/result`)
    at.mount(sessionListAtom)
    const notes = resultNotesAtom(session.id)
    at.mount(notes)

    await vi.waitFor(() => expect(at.get(sessionListAtom)).toHaveLength(1))
    expect(at.get(notes)).toBe('')

    at.dispose()
  })

  it('keeps what the user typed when the sessions table is re-read', async () => {
    const { app, session } = await withLiveSession()

    const notes = resultNotesAtom(session.id)
    app.mount(notes)
    app.set(notes, 'felt strong')

    // Any write that refreshes the table hands every reader a *new* session
    // object. That identity change is what used to wipe the field.
    mutate(app, sessionMutation, finishSession(session.id, 'manual'))
    await vi.waitFor(() => expect(app.get(sessionListAtom)[0]?.status).toBe('completed'))

    expect(app.get(notes)).toBe('felt strong')

    app.dispose()
  })

  it('re-reads from disk after the screen has been left and come back to', async () => {
    const { app, session } = await withLiveSession()

    const notes = resultNotesAtom(session.id)
    app.mount(notes)
    app.set(notes, 'unsaved')
    expect(app.get(notes)).toBe('unsaved')
    app.dispose()

    // A fresh registry is a fresh visit: the finalizer reset the seeding flag,
    // so what comes back is what was actually stored — not the draft.
    const again = await appAt(`/session/${session.id}/result`)
    again.mount(sessionListAtom)
    again.mount(resultNotesAtom(session.id))
    await vi.waitFor(() => expect(again.get(sessionListAtom)).toHaveLength(1))

    expect(again.get(resultNotesAtom(session.id))).toBe('')

    again.dispose()
  })

  it('keeps one draft per session', async () => {
    const app = await appAt('/')
    const first = resultNotesAtom('session-a')
    const second = resultNotesAtom('session-b')
    app.mount(first)
    app.mount(second)

    app.set(first, 'a')

    expect(app.get(first)).toBe('a')
    expect(app.get(second)).toBe('')

    app.dispose()
  })
})

/**
 * Two conditions, one answer — and the reason it is an atom rather than a
 * `computed` in the run view: the wake lock is held by an atom that has no
 * component, and this is what it reads.
 */
describe('keep awake', () => {
  it('is on only when the setting is on and a workout is live', async () => {
    const { app, session } = await withLiveSession()
    app.dispose()

    const at = await appAt(`/session/${session.id}`)
    at.mount(sessionListAtom)
    at.mount(keepAwakeAtom)
    await vi.waitFor(() => expect(at.get(currentSessionAtom)).toBeDefined())

    // `keepAwake` defaults to true, so a live workout on its own screen is the
    // case that should hold the lock.
    expect(at.get(keepAwakeAtom)).toBe(true)

    mutate(at, settingsMutation, updateTimerSettings({ keepAwake: false }))
    await vi.waitFor(() => expect(at.get(keepAwakeAtom)).toBe(false))

    mutate(at, settingsMutation, updateTimerSettings({ keepAwake: true }))
    await vi.waitFor(() => expect(at.get(keepAwakeAtom)).toBe(true))

    // Finished is not live: the screen stays open on the result, and the lock
    // must not.
    mutate(at, sessionMutation, finishSession(session.id, 'manual'))
    await vi.waitFor(() => expect(at.get(keepAwakeAtom)).toBe(false))

    at.dispose()
  })

  it('is off when no workout is on screen', async () => {
    const app = await appAt('/')
    app.mount(sessionListAtom)
    app.mount(keepAwakeAtom)

    expect(app.get(keepAwakeAtom)).toBe(false)

    app.dispose()
  })
})
