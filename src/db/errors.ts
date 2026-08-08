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
