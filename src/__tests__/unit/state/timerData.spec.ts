import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPreset,
  createSession,
  DEFAULT_TIMER_SETTINGS,
  finishSession,
  presetMutation,
  resetDatabase,
  sessionMutation,
  settingsMutation,
  updateTimerSettings,
  workoutStartMutation,
  type DbServices,
  type NewSession,
  type PresetDraft,
} from '@/db'
import { presetListAtom, sessionListAtom, timerSettingsValueAtom } from '@/state/timerData'
import { harness } from '../harness'

/**
 * The db read atoms and the invalidation rule behind them, in Node.
 *
 * This tier is supposed to be pure logic, and Dexie over `fake-indexeddb` is a
 * real storage engine — but it is an in-memory one that needs no DOM, and what
 * is under test *is* logic: which read atoms a write invalidates. Proving that
 * in the browser tier costs a Chromium boot to assert something no pixel is
 * involved in.
 */
beforeEach(async () => {
  await resetDatabase()
})

const AMRAP = { mode: 'amrap', durationMs: 60_000 } as const

const sessionDraft = (patch: Partial<NewSession> = {}): NewSession => ({
  config: AMRAP,
  workoutNotes: '',
  countdownDurationMs: 0,
  ...patch,
})

const presetDraft = (name: string): PresetDraft => ({ name, config: AMRAP, workoutNotes: '' })

type App = ReturnType<typeof harness>

/**
 * Write through a mutation atom, the way a component does — `harness.write`
 * mounts it first, because writing an unmounted function atom is a no-op.
 *
 * `Effect.orDie` is not decoration: a mutation atom accepts only
 * `Effect<unknown, never, DbServices>`, and it is what says a failure here is a
 * broken test rather than a case under test — the failure branches are the
 * views' business (`Effect.catchTags`), and they have their own specs.
 */
function mutate(
  app: App,
  mutation: typeof sessionMutation,
  program: Effect.Effect<unknown, unknown, DbServices>,
): void {
  app.write(mutation, Effect.orDie(program))
}

describe('db read atoms', () => {
  it('publishes rows written to the database', async () => {
    const app = harness()
    app.mount(sessionListAtom)

    mutate(app, sessionMutation, createSession(sessionDraft()))

    await vi.waitFor(() => expect(app.get(sessionListAtom)).toHaveLength(1))
    expect(app.get(sessionListAtom)[0]?.config).toEqual(AMRAP)

    app.dispose()
  })

  it('reads settings as the canonical defaults before a row exists', () => {
    const app = harness()
    app.mount(timerSettingsValueAtom)

    // The unwrapped read treats "still loading" as "no answer yet" and hands
    // back the frozen default, which is what keeps seven screens from each
    // having to spell out a loading branch.
    expect(app.get(timerSettingsValueAtom)).toEqual(DEFAULT_TIMER_SETTINGS)

    app.dispose()
  })

  it('follows a settings write', async () => {
    const app = harness()
    app.mount(timerSettingsValueAtom)

    mutate(app, settingsMutation, updateTimerSettings({ keepAwake: false }))

    await vi.waitFor(() => expect(app.get(timerSettingsValueAtom).keepAwake).toBe(false))

    app.dispose()
  })
})

/**
 * The rule the whole `src/db/atoms.ts` split exists for, and the one nothing
 * asserted until now.
 *
 * Over-invalidating is not merely wasteful. A re-read hands components a fresh
 * array of freshly decoded objects, and anything keyed on that identity re-runs
 * — which is how pausing a timer used to re-read presets, re-run the setup
 * screen's seeding watcher, and discard whatever the user had typed. So the
 * assertion here is deliberately about *identity*, not contents: contents would
 * be equal either way, and the bug is invisible to `toEqual`.
 */
describe('mutation invalidation', () => {
  async function seeded(): Promise<App> {
    const app = harness()
    app.mount(sessionListAtom)
    app.mount(presetListAtom)

    mutate(app, presetMutation, createPreset(presetDraft('Cindy')))
    mutate(app, sessionMutation, createSession(sessionDraft()))

    await vi.waitFor(() => {
      expect(app.get(presetListAtom)).toHaveLength(1)
      expect(app.get(sessionListAtom)).toHaveLength(1)
    })

    return app
  }

  it('re-reads sessions on a session write and leaves presets untouched', async () => {
    const app = await seeded()
    const presetsBefore = app.get(presetListAtom)
    const sessionId = app.get(sessionListAtom)[0]!.id

    mutate(app, sessionMutation, finishSession(sessionId, 'manual'))

    await vi.waitFor(() => expect(app.get(sessionListAtom)[0]?.status).toBe('completed'))
    expect(app.get(presetListAtom)).toBe(presetsBefore)

    app.dispose()
  })

  it('re-reads presets on a preset write and leaves sessions untouched', async () => {
    const app = await seeded()
    const sessionsBefore = app.get(sessionListAtom)

    mutate(app, presetMutation, createPreset(presetDraft('Mary')))

    await vi.waitFor(() => expect(app.get(presetListAtom)).toHaveLength(2))
    expect(app.get(sessionListAtom)).toBe(sessionsBefore)

    app.dispose()
  })

  /**
   * Starting a workout is the one operation that legitimately touches both
   * tables — it writes the session *and* stamps the preset's `lastUsedAt` — so
   * it is the one that must invalidate both keys. It is also why widening an
   * existing mutation is the wrong fix for a new write: add the edge, do not
   * broaden one.
   */
  it('re-reads both when a workout starts from a preset', async () => {
    const app = await seeded()
    // Only one workout may be live at a time — the repository refuses a second
    // — so the seeded one has to be put away before this one can start.
    mutate(app, sessionMutation, finishSession(app.get(sessionListAtom)[0]!.id, 'manual'))
    await vi.waitFor(() => expect(app.get(sessionListAtom)[0]?.status).toBe('completed'))

    const presetsBefore = app.get(presetListAtom)
    const sessionsBefore = app.get(sessionListAtom)

    mutate(
      app,
      workoutStartMutation,
      createSession(sessionDraft({ presetId: presetsBefore[0]!.id })),
    )

    await vi.waitFor(() => expect(app.get(sessionListAtom)).toHaveLength(2))
    expect(app.get(sessionListAtom)).not.toBe(sessionsBefore)
    expect(app.get(presetListAtom)).not.toBe(presetsBefore)

    app.dispose()
  })
})
