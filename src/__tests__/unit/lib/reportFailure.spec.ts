import { Effect, Logger } from 'effect'
import { describe, expect, it } from 'vitest'
import { failureReporter } from '@/lib/reportFailure'

/**
 * The three keys every report is supposed to carry — the subject of the test
 * below, written as a type so the collector says what it is collecting. The
 * values stay `unknown` because that is what the logger hands over; the
 * assertions are what pin them to strings.
 */
type ReportedAnnotations = {
  readonly boundary?: unknown
  readonly operation?: unknown
  readonly failure?: unknown
}

/**
 * The failure branch six views share, as a pure function.
 *
 * It used to be `useReportFailure`, a composable that reached for the toast
 * store itself — which meant the only way to check that a failed save actually
 * says something to the user was to render a screen and make its database
 * fail. Taking `showToast` as a parameter turns that into four lines of Node.
 */
const record = () => {
  const shown: Array<string> = []
  return { shown, showToast: (message: string): void => void shown.push(message) }
}

describe('failureReporter', () => {
  it('tells the user, and recovers, so the caller can carry on', async () => {
    const toast = record()
    const reportFailure = failureReporter('settings', toast.showToast)

    const result = await Effect.runPromise(
      Effect.fail({ _tag: 'Db.DatabaseError' } as const).pipe(
        Effect.catchTag('Db.DatabaseError', reportFailure('export backup', 'Export failed')),
        Effect.as('carried on'),
      ),
    )

    expect(toast.shown).toEqual(['Export failed'])
    expect(result).toBe('carried on')
  })

  it('says nothing when nothing failed', async () => {
    const toast = record()
    const reportFailure = failureReporter('settings', toast.showToast)

    // Typed as fallible but not failing — `catchTag` has nothing to match on
    // an `Effect` whose error channel is already `never`.
    const succeeding: Effect.Effect<string, { readonly _tag: 'Db.DatabaseError' }> =
      Effect.succeed('fine')

    await Effect.runPromise(
      succeeding.pipe(
        Effect.catchTag('Db.DatabaseError', reportFailure('export backup', 'Export failed')),
      ),
    )

    expect(toast.shown).toEqual([])
  })

  /**
   * One reporter per boundary, but the same three log keys everywhere — that
   * is the point of there being one helper rather than one per component, and
   * `_tag` is what makes a log entry searchable by failure type.
   */
  it('annotates every report with the same keys', async () => {
    const entries: Array<ReportedAnnotations> = []
    const reportFailure = failureReporter('timer-run', () => {})

    // `formatStructured` is the shape a log entry has once the fiber's
    // annotations are folded in — reading them off `Options` directly would
    // miss the very thing under test.
    const collector = Logger.map(Logger.formatStructured, ({ annotations }) => {
      entries.push(annotations)
    })

    await Effect.runPromise(
      Effect.fail({ _tag: 'Db.WorkoutInvalidError' } as const).pipe(
        Effect.catchTag('Db.WorkoutInvalidError', reportFailure('update timer', 'Could not save')),
        Effect.provide(Logger.layer([collector])),
      ),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      boundary: 'timer-run',
      operation: 'update timer',
      failure: 'Db.WorkoutInvalidError',
    })
  })
})
