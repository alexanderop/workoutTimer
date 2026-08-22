import { Atom } from '@effect/atom-vue'
import { isActiveSession, isFinishedSession } from '@/db'
import { clockAtom } from '@/state/browser'
import {
  presetListAtom,
  presetsLoadFailedAtom,
  sessionListAtom,
  sessionsLoadFailedAtom,
  timerSettingsValueAtom,
} from '@/state/timerData'
import { routeParamAtom } from '@/state/route'
import { deriveTimer, finalResult, sortPresets, sortSessions } from '@/features/timer/domain'
import type { WorkoutSession } from '@/db'
import type { DerivedTimer, HistoryFilter } from '@/features/timer/domain'

/**
 * Everything the timer screens read, as derivations over the store atoms.
 *
 * These used to be `computed`s inside seven `<script setup>` blocks, which put
 * them outside both the unit tier and the arch tests. As atoms they are plain
 * values in a registry: a test seeds `sessionsAtom`, reads `activeSessionAtom`,
 * and never mounts a component.
 */

/**
 * Whether a picker's custom-value panel is expanded, keyed by the picker's DOM
 * id — which is already unique per screen, and is the id the panel's
 * `aria-controls` points at.
 *
 * Component-local state still lives in the registry rather than in a `ref`:
 * that is what makes "the custom panel was left open" a thing a test can read
 * without a component. Not `keepAlive`, so it is dropped with the screen — the
 * panel is an affordance for editing a draft, and the draft resets too.
 */
export const pickerCustomOpenAtom = Atom.family((_id: string) => Atom.make(false))

/**
 * Whether a workout is still on the clock. The predicate comes from `@/db`,
 * where it is derived from the schema's status list, rather than being a
 * second array spelled out here — the repository refuses to start a workout
 * while any active one exists and looks them up by exactly that set, so two
 * spellings of "still going" would let this screen offer a Start the database
 * then rejects.
 */
const isLive = (session: WorkoutSession): boolean => isActiveSession(session.status)

/**
 * Wall-clock time for the running timer, ticking ten times a second.
 *
 * A tenth of a second is the resolution `formatDuration(…, showTenths)` needs
 * under ten seconds; nothing on screen changes faster.
 */
export const nowAtom = clockAtom(100)

const sortedSessionsAtom = Atom.map(sessionListAtom, sortSessions)

export const sortedPresetsAtom = Atom.map(presetListAtom, sortPresets)

export const recentPresetsAtom = Atom.map(sortedPresetsAtom, (presets) => presets.slice(0, 4))

/**
 * The home screen reads two tables and shows one error line, so the failure of
 * either is the same fact to it.
 */
export const homeLoadFailedAtom = Atom.make(
  (get) => get(sessionsLoadFailedAtom) || get(presetsLoadFailedAtom),
)

/**
 * Which slice of history is on screen. A `ref` in the view before; an atom now,
 * which means the filtering rule below is testable without rendering the list.
 *
 * `keepAlive` is what makes the choice survive a navigation away and back. The
 * registry drops a plain atom when its last subscriber goes, so without it the
 * filter would reset every time the screen unmounted — which is the `ref`
 * behaviour this was meant to replace.
 */
export const historyFilterAtom: Atom.Writable<HistoryFilter> = Atom.make<HistoryFilter>('all').pipe(
  Atom.keepAlive,
)

/** Finished workouts, newest first, narrowed by the active filter. */
export const historySessionsAtom = Atom.make((get) => {
  const filter = get(historyFilterAtom)
  return get(sortedSessionsAtom).filter(
    (session) =>
      isFinishedSession(session.status) && (filter === 'all' || session.status === filter),
  )
})

/** The workout the app should offer to resume, if any. */
export const activeSessionAtom = Atom.map(sessionListAtom, (sessions) => sessions.find(isLive))

export const hasActiveSessionAtom = Atom.map(activeSessionAtom, (session) => session !== undefined)

/**
 * The session addressed by the current URL (`/timer/run/:id`, `/history/:id`).
 *
 * The run, result and detail screens all mean the same thing by "this
 * session", so they share one atom rather than three identical `computed`s
 * over `route.params.id`.
 */
export const currentSessionAtom = Atom.make((get): WorkoutSession | undefined => {
  const id = get(routeParamAtom('id'))
  if (id === undefined) return undefined
  return get(sessionListAtom).find((session) => session.id === id)
})

/**
 * The finished shape of the current session — elapsed time and rounds frozen
 * at `finishedAt`. Distinct from `runDerivedTimerAtom`, which follows the
 * clock; the result and detail screens must not tick.
 *
 * They only ever address a finished session, so the clock is a fallback for a
 * URL that names a live one. Reading it *conditionally* is what keeps it from
 * costing anything: a session with a `finishedAt` never touches `nowAtom`, so
 * no dependency on it is recorded and no interval starts. A bare `Date.now()`
 * would freeze at whenever the read first ran instead.
 */
export const currentSessionResultAtom = Atom.make((get): DerivedTimer | undefined => {
  const session = get(currentSessionAtom)
  if (session === undefined) return undefined
  return finalResult(session, get(nowAtom))
})

/** The current session re-derived against the ticking clock. */
export const runDerivedTimerAtom = Atom.make((get): DerivedTimer | undefined => {
  const session = get(currentSessionAtom)
  return session === undefined ? undefined : deriveTimer(session, get(nowAtom))
})

/** What is on disk for this session's notes; `''` until its row arrives. */
const resultNotesSeedAtom = Atom.family((sessionId: string) =>
  Atom.make(
    (get): string => get(sessionListAtom).find((item) => item.id === sessionId)?.notes ?? '',
  ),
)

/** What the user typed, or `undefined` while they have typed nothing. */
const resultNotesEditAtom = Atom.family((_sessionId: string) =>
  Atom.make<string | undefined>(undefined),
)

/**
 * The result screen's notes field, one atom per session: the edit if there is
 * one, what is on disk otherwise.
 *
 * Seeding is the whole difficulty. A `watch` on the session re-seeded on every
 * change to that row's *identity*, so any write that refreshed the sessions
 * table discarded what the user had typed — the same class of bug that
 * `src/db/atoms.ts` splits its mutation atoms to avoid. Splitting the seed
 * from the edit states the rule instead of implying it, and keeps it
 * registry-scoped: a `seeded` flag in the family factory would be shared by
 * every registry asking for this session, because a family memoizes one atom
 * object per key at module scope.
 *
 * Neither atom is `keepAlive`, so leaving the screen and coming back re-reads
 * what was actually saved.
 */
export const resultNotesAtom = Atom.family((sessionId: string) =>
  Atom.writable<string, string>(
    (get) => get(resultNotesEditAtom(sessionId)) ?? get(resultNotesSeedAtom(sessionId)),
    (ctx, notes) => ctx.set(resultNotesEditAtom(sessionId), notes),
  ),
)

/**
 * Whether the screen wake lock should be held: the user asked for it, and a
 * workout is actually on screen.
 */
export const keepAwakeAtom = Atom.make((get): boolean => {
  const session = get(currentSessionAtom)
  return get(timerSettingsValueAtom).keepAwake && session !== undefined && isLive(session)
})
