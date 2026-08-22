import { Effect } from 'effect'
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
 * A stored row, decoded. A row that does not match is a `DatabaseError`
 * naming the decode that failed, not a `WorkoutInvalidError`: nobody handed
 * this in, it was already on disk.
 *
 * `Stored` is whatever the decoder accepts, the same way `validateDraft`
 * below takes its `In` from its own decoder — this wrapper only re-tags the
 * failure, so it has no opinion of its own about the input.
 */
export const decodeRow =
  <Stored, A, E>(operation: string, decode: (stored: Stored) => Effect.Effect<A, E>) =>
  (stored: Stored): Effect.Effect<A, DatabaseError> =>
    decode(stored).pipe(Effect.mapError((cause) => new DatabaseError({ operation, cause })))

/** A draft the caller handed in, validated. */
export const validateDraft =
  <In, A, E extends { readonly message: string }>(decode: (draft: In) => Effect.Effect<A, E>) =>
  (draft: In): Effect.Effect<A, WorkoutInvalidError> =>
    decode(draft).pipe(Effect.mapError((error) => invalid(error.message)))
