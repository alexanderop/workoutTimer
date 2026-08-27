import { Schema } from 'effect'

export class DatabaseError extends Schema.TaggedError<DatabaseError>()('Db.DatabaseError', {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class BackupInvalidError extends Schema.TaggedError<BackupInvalidError>()(
  'Db.BackupInvalidError',
  { message: Schema.String },
) {}

export class WorkoutInvalidError extends Schema.TaggedError<WorkoutInvalidError>()(
  'Db.WorkoutInvalidError',
  { message: Schema.String },
) {}

/**
 * A workout is already on the clock, so a second one cannot start.
 *
 * A rule, not a malfunction — and it used to arrive as a `DatabaseError`
 * carrying a thrown `Error('an active session already exists')`, so the only
 * thing the setup screen could say about it was "the workout could not be
 * started".
 *
 * No payload: the tag is the whole message, and a screen that wants to name
 * the workout in the way already has `activeSessionAtom` reading the same
 * table. Carrying the id here would be a second answer to a question the app
 * already answers.
 */
export class SessionActiveError extends Schema.TaggedError<SessionActiveError>()(
  'Db.SessionActiveError',
  {},
) {}
