import { Effect } from 'effect'
import type { TimerPreset, TimerSettings, WorkoutSession } from '../converters'
import { DatabaseError, WorkoutInvalidError } from '../errors'

/**
 * What every repository in this directory is built out of.
 *
 * IndexedDB is untrusted input and Dexie is a promise API, so each repository
 * does the same two things at its edges: wrap a Dexie call so a rejection
 * becomes a tagged `DatabaseError`, and decode what came back so a row that no
 * longer matches the schema fails by name rather than flowing into the app.
 * Three copies of that is how the copies drift.
 */
export const tryDb = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DatabaseError({ operation, cause }),
  })

/** A draft the caller got wrong — distinct from the database being unwell. */
export const invalid = (message: string): WorkoutInvalidError =>
  new WorkoutInvalidError({ message })

/**
 * A row as a Dexie table hands it back — which is a claim about what was
 * written, not a check on what came out. `converters.ts` says why that
 * distinction matters; `decodeRow` below is where the claim gets tested.
 */
type StoredRow = TimerPreset | TimerSettings | WorkoutSession

/**
 * A stored row, decoded. A row that does not match is a `DatabaseError`
 * naming the decode that failed, not a `WorkoutInvalidError`: nobody handed
 * this in, it was already on disk.
 */
export const decodeRow =
  <A, E>(operation: string, decode: (stored: StoredRow) => Effect.Effect<A, E>) =>
  (stored: StoredRow): Effect.Effect<A, DatabaseError> =>
    decode(stored).pipe(Effect.mapError((cause) => new DatabaseError({ operation, cause })))

/** A draft the caller handed in, validated. */
export const validateDraft =
  <In, A, E extends { readonly message: string }>(decode: (draft: In) => Effect.Effect<A, E>) =>
  (draft: In): Effect.Effect<A, WorkoutInvalidError> =>
    decode(draft).pipe(Effect.mapError((error) => invalid(error.message)))
