import { Clock, Context, Effect, Layer } from 'effect'
import { ACTIVE_STATUSES, decodeNewSession, decodeWorkoutSession } from '../converters'
import type { FinishReason, NewSession, WorkoutSession } from '../converters'
import type { DatabaseError, WorkoutInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { appendRound, finishAt, pauseAt, resumeAt, startRunning } from '../sessionTransitions'
import { decodeRow, invalid, tryDb, validateDraft } from './shared'

const decodeSessionRow = decodeRow('decode session row', decodeWorkoutSession)
const validateSessionDraft = validateDraft(decodeNewSession)

/**
 * Read one session, hand it to a transition, store whatever comes back — all
 * inside one transaction, so the row cannot move between the read and the
 * write. `false` means the transition declined (or the row is gone), which
 * every caller here treats as a no-op rather than a failure.
 */
const changeSession = (
  operation: string,
  id: string,
  change: (current: WorkoutSession) => WorkoutSession | undefined,
): Effect.Effect<boolean, DatabaseError> =>
  tryDb(operation, () =>
    db.transaction('rw', db.sessions, async () => {
      const current = await db.sessions.get(id)
      if (current === undefined) return false

      const next = change(current)
      if (next === undefined) return false

      await db.sessions.put(next)
      return true
    }),
  )

/**
 * The workouts themselves: what a session is, and every way one moves.
 *
 * `createSession` also stamps the preset's `lastUsedAt`, so this service
 * touches a second table — which looks like a boundary break and is not. The
 * unit here is the *aggregate*, not the table: starting a workout is one
 * transaction that must not half-happen, and the app already says so, since
 * `workoutStartMutation` is the write edge that invalidates both keys.
 */
export class SessionsRepo extends Context.Service<
  SessionsRepo,
  {
    listSessions: () => Effect.Effect<Array<WorkoutSession>, DatabaseError>
    createSession: (
      draft: NewSession,
    ) => Effect.Effect<WorkoutSession, DatabaseError | WorkoutInvalidError>
    markRunning: (id: string) => Effect.Effect<void, DatabaseError>
    pauseSession: (id: string) => Effect.Effect<void, DatabaseError>
    resumeSession: (id: string) => Effect.Effect<void, DatabaseError>
    /** Resolves `true` only when a split was actually appended — see the implementation. */
    addRound: (
      id: string,
      elapsedMs: number,
    ) => Effect.Effect<boolean, DatabaseError | WorkoutInvalidError>
    finishSession: (id: string, reason: FinishReason) => Effect.Effect<void, DatabaseError>
    updateSessionNotes: (id: string, notes: string) => Effect.Effect<void, DatabaseError>
    deleteSession: (id: string) => Effect.Effect<void, DatabaseError>
  }
>()('workout-timer/db/SessionsRepo') {
  static readonly layer = Layer.effect(
    SessionsRepo,
    Effect.gen(function* () {
      const generateId = yield* GenerateId

      return SessionsRepo.of({
        listSessions: Effect.fn('SessionsRepo.listSessions')(function* () {
          const rows = yield* tryDb('list sessions', () =>
            db.sessions.orderBy('createdAt').reverse().toArray(),
          )
          return yield* Effect.forEach(rows, decodeSessionRow)
        }),

        createSession: Effect.fn('SessionsRepo.createSession')(function* (draft: NewSession) {
          const valid = yield* validateSessionDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const session: WorkoutSession = {
            id: generateId(),
            ...(valid.presetId === undefined ? {} : { presetId: valid.presetId }),
            config: valid.config,
            status: valid.countdownDurationMs > 0 ? 'countdown' : 'running',
            workoutNotes: valid.workoutNotes,
            notes: '',
            countdownDurationMs: valid.countdownDurationMs,
            startedAt: now + valid.countdownDurationMs,
            accumulatedPausedMs: 0,
            rounds: [],
            createdAt: now,
            updatedAt: now,
          }

          yield* tryDb('create session', () =>
            db.transaction('rw', db.sessions, db.presets, async () => {
              const active = await db.sessions
                .where('status')
                .anyOf([...ACTIVE_STATUSES])
                .first()
              if (active) throw new Error('an active session already exists')
              await db.sessions.add(session)
              if (valid.presetId !== undefined) {
                await db.presets.update(valid.presetId, { lastUsedAt: now })
              }
            }),
          )
          return session
        }),

        markRunning: Effect.fn('SessionsRepo.markRunning')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* changeSession('mark session running', id, (current) => startRunning(current, now))
        }),

        pauseSession: Effect.fn('SessionsRepo.pauseSession')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* changeSession('pause session', id, (current) => pauseAt(current, now))
        }),

        resumeSession: Effect.fn('SessionsRepo.resumeSession')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* changeSession('resume session', id, (current) => resumeAt(current, now))
        }),

        /**
         * Appending a split is conditional — the session may have finished
         * between the tap and this write, and a double-tap inside
         * `ROUND_DEBOUNCE_MS` is one round, not two. Both cases are a
         * legitimate no-op rather than a failure, so the outcome is reported
         * in the success channel: the caller needs it to decide whether to
         * play the round cue, and a cue for a split that was never recorded
         * tells the user something untrue.
         */
        addRound: Effect.fn('SessionsRepo.addRound')(function* (id: string, elapsedMs: number) {
          if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
            return yield* Effect.fail(invalid('round elapsed time must be a natural number'))
          }
          const now = yield* Clock.currentTimeMillis
          return yield* changeSession('add round', id, (current) =>
            appendRound(current, elapsedMs, now),
          )
        }),

        finishSession: Effect.fn('SessionsRepo.finishSession')(function* (
          id: string,
          reason: FinishReason,
        ) {
          const now = yield* Clock.currentTimeMillis
          yield* changeSession('finish session', id, (current) => finishAt(current, reason, now))
        }),

        updateSessionNotes: Effect.fn('SessionsRepo.updateSessionNotes')(function* (
          id: string,
          notes: string,
        ) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('update session notes', async () => {
            await db.sessions.update(id, { notes: notes.trim(), updatedAt: now })
          })
        }),

        deleteSession: Effect.fn('SessionsRepo.deleteSession')(function* (id: string) {
          yield* tryDb('delete session', async () => db.sessions.delete(id))
        }),
      })
    }),
  )
}

export const listSessions = SessionsRepo.use((repo) => repo.listSessions())
export const createSession = (draft: NewSession) =>
  SessionsRepo.use((repo) => repo.createSession(draft))
export const markSessionRunning = (id: string) => SessionsRepo.use((repo) => repo.markRunning(id))
export const pauseSession = (id: string) => SessionsRepo.use((repo) => repo.pauseSession(id))
export const resumeSession = (id: string) => SessionsRepo.use((repo) => repo.resumeSession(id))
export const addSessionRound = (id: string, elapsedMs: number) =>
  SessionsRepo.use((repo) => repo.addRound(id, elapsedMs))
export const finishSession = (id: string, reason: FinishReason) =>
  SessionsRepo.use((repo) => repo.finishSession(id, reason))
export const updateSessionNotes = (id: string, notes: string) =>
  SessionsRepo.use((repo) => repo.updateSessionNotes(id, notes))
export const deleteSession = (id: string) => SessionsRepo.use((repo) => repo.deleteSession(id))
