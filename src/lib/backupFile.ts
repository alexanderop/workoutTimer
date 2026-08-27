/**
 * The file end of backup export/import: turning a payload into a downloaded
 * file and a picked file back into a payload.
 *
 * What a backup *contains* and whether it is valid is `@/db`'s business
 * (src/db/backup.ts owns serialization and schema validation) — this module
 * only moves it across the browser boundary.
 *
 * Both directions are Effect programs with a tagged failure, so a component
 * can compose them with the `@/db` programs into one pipeline and match on
 * every way it can fail in a single `Effect.catchTags`.
 */
import { Effect, Schema } from 'effect'
import { downloadBlob } from './download'

/** Stem of every exported backup file; the export date is appended. */
const BACKUP_FILENAME_STEM = 'workout-timer-backup'

/**
 * The `YYYY-MM-DD` an ISO timestamp opens with, and nothing else.
 *
 * The anchor is the whole point: unanchored, this happily finds a date in the
 * middle of a hand-edited `exportedAt` and puts whatever it found into a
 * filename.
 */
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/

/** Moving a backup across the browser's file boundary failed. */
export class BackupFileError extends Schema.TaggedError<BackupFileError>()(
  'BackupFile.BackupFileError',
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/**
 * Date-stamped name for a backup file, derived from the payload's own
 * `exportedAt` timestamp — the file is named after the data it holds, not
 * after the clock at save time.
 *
 * A timestamp that is not an ISO date is dropped instead of trusted: the rest
 * of an ISO string contains `:` (illegal in Windows filenames) and a
 * hand-edited payload could carry a path separator, so nothing unvalidated
 * reaches the filename.
 */
export function backupFilename(exportedAt: string): string {
  const day = ISO_DATE_PREFIX.exec(exportedAt)?.[0]

  return day ? `${BACKUP_FILENAME_STEM}-${day}.json` : `${BACKUP_FILENAME_STEM}.json`
}

// Everything below crosses the browser file boundary (Blob, File, anchor
// click) and is exercised in the browser tier, not the Node unit tier. Left
// mutable it would report as uncovered forever — see docs/mutation-testing.md.
// Stryker disable all

/** Serialize a backup payload and hand it to the browser as a download. */
export const downloadBackup = (payload: {
  exportedAt: string
}): Effect.Effect<void, BackupFileError> =>
  Effect.try({
    try: () => {
      const json = JSON.stringify(payload, null, 2)

      downloadBlob(
        new Blob([json], { type: 'application/json' }),
        backupFilename(payload.exportedAt),
      )
    },
    catch: (cause) => new BackupFileError({ operation: 'download backup', cause }),
  })

/**
 * Read a user-picked file into a payload. Fails for anything that is not
 * readable JSON; whether the JSON is actually a backup is `importData`'s call.
 *
 * `Schema.Json` — not `unknown` — is what a successful `JSON.parse` proves:
 * the bytes were syntactically JSON. That is the whole contract this side of
 * the boundary can offer, and stating it lets `decodeBackup` declare that it
 * narrows JSON to a backup rather than anything to a backup.
 */
export const readBackupFile = (file: File): Effect.Effect<Schema.Json, BackupFileError> =>
  Effect.tryPromise({
    try: async (): Promise<Schema.Json> => JSON.parse(await file.text()),
    catch: (cause) => new BackupFileError({ operation: 'read backup file', cause }),
  })
