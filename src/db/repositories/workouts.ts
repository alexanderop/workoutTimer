import { Clock, Context, Effect, Layer } from 'effect'
import type {
  NewSession,
  PresetDraft,
  TimerPreset,
  TimerSettings,
  WorkoutSession,
} from '@/types/workout'
import {
  decodeNewSession,
  decodePresetDraft,
  decodeStoredTimerPreset,
  decodeStoredTimerSettings,
  decodeStoredWorkoutSession,
  makeDefaultTimerSettings,
  toTimerPreset,
  toTimerSettings,
  toWorkoutSession,
} from '../converters'
import { DatabaseError, WorkoutInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'

const tryDb = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DatabaseError({ operation, cause }),
  })

const invalid = (message: string) => new WorkoutInvalidError({ message })

const validateSessionDraft = (draft: NewSession) =>
  decodeNewSession(draft).pipe(Effect.mapError((error) => invalid(error.message)))

const validatePresetDraft = (draft: PresetDraft) =>
  decodePresetDraft(draft).pipe(Effect.mapError((error) => invalid(error.message)))

const decodeSessionRow = (stored: unknown): Effect.Effect<WorkoutSession, DatabaseError> =>
  decodeStoredWorkoutSession(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode session row', cause })),
    Effect.map(toWorkoutSession),
  )

const decodePresetRow = (stored: unknown): Effect.Effect<TimerPreset, DatabaseError> =>
  decodeStoredTimerPreset(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode preset row', cause })),
    Effect.map(toTimerPreset),
  )

const decodeSettingsRow = (stored: unknown): Effect.Effect<TimerSettings, DatabaseError> =>
  decodeStoredTimerSettings(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode settings row', cause })),
    Effect.map(toTimerSettings),
  )

export class WorkoutsRepo extends Context.Service<
  WorkoutsRepo,
  {
    listSessions: () => Effect.Effect<Array<WorkoutSession>, DatabaseError>
    getSession: (id: string) => Effect.Effect<WorkoutSession | undefined, DatabaseError>
    createSession: (
      draft: NewSession,
    ) => Effect.Effect<WorkoutSession, DatabaseError | WorkoutInvalidError>
    markRunning: (id: string) => Effect.Effect<void, DatabaseError>
    pauseSession: (id: string) => Effect.Effect<void, DatabaseError>
    resumeSession: (id: string) => Effect.Effect<void, DatabaseError>
    addRound: (
      id: string,
      elapsedMs: number,
    ) => Effect.Effect<void, DatabaseError | WorkoutInvalidError>
    finishSession: (
      id: string,
      reason: 'endpoint' | 'manual' | 'timeCap' | 'cancelled',
    ) => Effect.Effect<void, DatabaseError>
    updateSessionNotes: (id: string, notes: string) => Effect.Effect<void, DatabaseError>
    deleteSession: (id: string) => Effect.Effect<void, DatabaseError>
    listPresets: () => Effect.Effect<Array<TimerPreset>, DatabaseError>
    getPreset: (id: string) => Effect.Effect<TimerPreset | undefined, DatabaseError>
    createPreset: (
      draft: PresetDraft,
    ) => Effect.Effect<TimerPreset, DatabaseError | WorkoutInvalidError>
    updatePreset: (
      id: string,
      draft: PresetDraft,
    ) => Effect.Effect<void, DatabaseError | WorkoutInvalidError>
    deletePreset: (id: string) => Effect.Effect<void, DatabaseError>
    getSettings: () => Effect.Effect<TimerSettings, DatabaseError>
    updateSettings: (
      patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>,
    ) => Effect.Effect<TimerSettings, DatabaseError>
    putBackup: (
      sessions: Array<WorkoutSession>,
      presets: Array<TimerPreset>,
      settings: TimerSettings,
    ) => Effect.Effect<void, DatabaseError>
  }
>()('workout-timer/db/WorkoutsRepo') {
  static readonly layer = Layer.effect(
    WorkoutsRepo,
    Effect.gen(function* () {
      const generateId = yield* GenerateId

      return WorkoutsRepo.of({
        listSessions: Effect.fn('WorkoutsRepo.listSessions')(function* () {
          const rows = yield* tryDb('list sessions', () =>
            db.sessions.orderBy('createdAt').reverse().toArray(),
          )
          return yield* Effect.forEach(rows, decodeSessionRow)
        }),

        getSession: Effect.fn('WorkoutsRepo.getSession')(function* (id: string) {
          const row = yield* tryDb('get session', () => db.sessions.get(id))
          return row === undefined ? undefined : yield* decodeSessionRow(row)
        }),

        createSession: Effect.fn('WorkoutsRepo.createSession')(function* (draft: NewSession) {
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
                .anyOf('countdown', 'running', 'paused')
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

        markRunning: Effect.fn('WorkoutsRepo.markRunning')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('mark session running', () =>
            db.transaction('rw', db.sessions, async () => {
              const current = await db.sessions.get(id)
              if (current?.status !== 'countdown') return
              await db.sessions.update(id, { status: 'running', updatedAt: now })
            }),
          )
        }),

        pauseSession: Effect.fn('WorkoutsRepo.pauseSession')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('pause session', () =>
            db.transaction('rw', db.sessions, async () => {
              const current = await db.sessions.get(id)
              if (current?.status !== 'running') return
              await db.sessions.update(id, {
                status: 'paused',
                pauseStartedAt: now,
                updatedAt: now,
              })
            }),
          )
        }),

        resumeSession: Effect.fn('WorkoutsRepo.resumeSession')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('resume session', () =>
            db.transaction('rw', db.sessions, async () => {
              const current = await db.sessions.get(id)
              if (current?.status !== 'paused' || current.pauseStartedAt === undefined) return
              const next = {
                ...current,
                status: 'running',
                accumulatedPausedMs:
                  current.accumulatedPausedMs + Math.max(0, now - current.pauseStartedAt),
                updatedAt: now,
              } as WorkoutSession & { pauseStartedAt?: number }
              delete next.pauseStartedAt
              await db.sessions.put(next)
            }),
          )
        }),

        addRound: Effect.fn('WorkoutsRepo.addRound')(function* (id: string, elapsedMs: number) {
          if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
            return yield* Effect.fail(invalid('round elapsed time must be a natural number'))
          }
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('add round', () =>
            db.transaction('rw', db.sessions, async () => {
              const current = await db.sessions.get(id)
              if (!current || !['running', 'paused'].includes(current.status)) return
              const last = current.rounds.at(-1)
              if (last && Math.abs(last.capturedAtElapsedMs - elapsedMs) < 250) return
              await db.sessions.update(id, {
                rounds: [...current.rounds, { capturedAtElapsedMs: elapsedMs }],
                updatedAt: now,
              })
            }),
          )
        }),

        finishSession: Effect.fn('WorkoutsRepo.finishSession')(function* (
          id: string,
          reason: 'endpoint' | 'manual' | 'timeCap' | 'cancelled',
        ) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('finish session', () =>
            db.transaction('rw', db.sessions, async () => {
              const current = await db.sessions.get(id)
              if (!current || ['completed', 'cancelled'].includes(current.status)) return
              const pausedMs =
                current.pauseStartedAt === undefined
                  ? current.accumulatedPausedMs
                  : current.accumulatedPausedMs + Math.max(0, now - current.pauseStartedAt)
              const next = {
                ...current,
                status: reason === 'cancelled' ? 'cancelled' : 'completed',
                finishReason: reason,
                finishedAt: now,
                accumulatedPausedMs: pausedMs,
                updatedAt: now,
              } as WorkoutSession & { pauseStartedAt?: number }
              delete next.pauseStartedAt
              await db.sessions.put(next)
            }),
          )
        }),

        updateSessionNotes: Effect.fn('WorkoutsRepo.updateSessionNotes')(function* (
          id: string,
          notes: string,
        ) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('update session notes', async () => {
            await db.sessions.update(id, { notes: notes.trim(), updatedAt: now })
          })
        }),

        deleteSession: Effect.fn('WorkoutsRepo.deleteSession')(function* (id: string) {
          yield* tryDb('delete session', async () => db.sessions.delete(id))
        }),

        listPresets: Effect.fn('WorkoutsRepo.listPresets')(function* () {
          const rows = yield* tryDb('list presets', () => db.presets.toArray())
          return yield* Effect.forEach(rows, decodePresetRow)
        }),

        getPreset: Effect.fn('WorkoutsRepo.getPreset')(function* (id: string) {
          const row = yield* tryDb('get preset', () => db.presets.get(id))
          return row === undefined ? undefined : yield* decodePresetRow(row)
        }),

        createPreset: Effect.fn('WorkoutsRepo.createPreset')(function* (draft: PresetDraft) {
          const valid = yield* validatePresetDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const preset: TimerPreset = {
            id: generateId(),
            name: valid.name,
            config: valid.config,
            workoutNotes: valid.workoutNotes,
            createdAt: now,
            updatedAt: now,
          }
          yield* tryDb('create preset', async () => db.presets.add(preset))
          return preset
        }),

        updatePreset: Effect.fn('WorkoutsRepo.updatePreset')(function* (
          id: string,
          draft: PresetDraft,
        ) {
          const valid = yield* validatePresetDraft(draft)
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('update preset', async () => {
            await db.presets.update(id, { ...valid, updatedAt: now })
          })
        }),

        deletePreset: Effect.fn('WorkoutsRepo.deletePreset')(function* (id: string) {
          yield* tryDb('delete preset', async () => db.presets.delete(id))
        }),

        getSettings: Effect.fn('WorkoutsRepo.getSettings')(function* () {
          const row = yield* tryDb('get timer settings', () => db.timerSettings.get('timer'))
          if (row === undefined) {
            return makeDefaultTimerSettings(yield* Clock.currentTimeMillis)
          }
          return yield* decodeSettingsRow(row)
        }),

        updateSettings: Effect.fn('WorkoutsRepo.updateSettings')(function* (
          patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>,
        ) {
          const now = yield* Clock.currentTimeMillis
          const currentRow = yield* tryDb('get timer settings for update', () =>
            db.timerSettings.get('timer'),
          )
          const current =
            currentRow === undefined
              ? makeDefaultTimerSettings(now)
              : yield* decodeSettingsRow(currentRow)
          const next: TimerSettings = { ...current, ...patch, id: 'timer', updatedAt: now }
          const validated = yield* decodeStoredTimerSettings(next).pipe(
            Effect.mapError(
              (cause) => new DatabaseError({ operation: 'validate timer settings', cause }),
            ),
          )
          yield* tryDb('update timer settings', async () => db.timerSettings.put(validated))
          return next
        }),

        putBackup: Effect.fn('WorkoutsRepo.putBackup')(function* (
          sessions: Array<WorkoutSession>,
          presets: Array<TimerPreset>,
          settings: TimerSettings,
        ) {
          yield* tryDb('import workout backup', () =>
            db.transaction('rw', db.sessions, db.presets, db.timerSettings, async () => {
              await db.sessions.bulkPut(sessions)
              await db.presets.bulkPut(presets)
              await db.timerSettings.put(settings)
            }),
          )
        }),
      })
    }),
  )
}

export const listSessions = WorkoutsRepo.use((repo) => repo.listSessions())
export const createSession = (draft: NewSession) =>
  WorkoutsRepo.use((repo) => repo.createSession(draft))
export const markSessionRunning = (id: string) => WorkoutsRepo.use((repo) => repo.markRunning(id))
export const pauseSession = (id: string) => WorkoutsRepo.use((repo) => repo.pauseSession(id))
export const resumeSession = (id: string) => WorkoutsRepo.use((repo) => repo.resumeSession(id))
export const addSessionRound = (id: string, elapsedMs: number) =>
  WorkoutsRepo.use((repo) => repo.addRound(id, elapsedMs))
export const finishSession = (
  id: string,
  reason: 'endpoint' | 'manual' | 'timeCap' | 'cancelled',
) => WorkoutsRepo.use((repo) => repo.finishSession(id, reason))
export const updateSessionNotes = (id: string, notes: string) =>
  WorkoutsRepo.use((repo) => repo.updateSessionNotes(id, notes))
export const deleteSession = (id: string) => WorkoutsRepo.use((repo) => repo.deleteSession(id))
export const listPresets = WorkoutsRepo.use((repo) => repo.listPresets())
export const createPreset = (draft: PresetDraft) =>
  WorkoutsRepo.use((repo) => repo.createPreset(draft))
export const updatePreset = (id: string, draft: PresetDraft) =>
  WorkoutsRepo.use((repo) => repo.updatePreset(id, draft))
export const deletePreset = (id: string) => WorkoutsRepo.use((repo) => repo.deletePreset(id))
export const getTimerSettings = WorkoutsRepo.use((repo) => repo.getSettings())
export const updateTimerSettings = (patch: Partial<Omit<TimerSettings, 'id' | 'updatedAt'>>) =>
  WorkoutsRepo.use((repo) => repo.updateSettings(patch))
