import { Effect } from 'effect'

/**
 * The failure branch every db-composing component shares: a structured log for
 * the developer, a toast for the user. The handler returns an Effect, so
 * recovery is part of the program rather than something that happens beside it
 * — and `Effect.logError` keeps the entry inside the program, on the fiber and
 * the span `Effect.fn` opened around the operation, which `console.error` in an
 * `Effect.sync` would step outside of.
 *
 * One helper rather than one per component so the log schema cannot drift:
 * every reported failure carries the same `boundary` / `operation` / `failure`
 * keys.
 *
 * `showToast` is a parameter rather than something this module reaches for,
 * which is what makes it a plain function instead of the composable it used to
 * be: no registry, no component, and a unit test can pass a recorder and read
 * back exactly what the user would have seen.
 *
 * Usage:
 *
 * ```ts
 * const showToast = useAtomSet(() => showToastAtom)
 * const reportFailure = failureReporter('timer', showToast)
 * // …then hand `reportFailure('save session', t('timer.run.saveFailed'))`
 * // to Effect.catchTag / Effect.catchTags.
 * ```
 */
export function failureReporter(
  boundary: string,
  showToast: (message: string) => void,
): (
  operation: string,
  message: string,
) => (error: { readonly _tag: string }) => Effect.Effect<void> {
  return (operation, message) => (error) =>
    Effect.logError(error).pipe(
      Effect.annotateLogs({ boundary, operation, failure: error._tag }),
      Effect.andThen(Effect.sync(() => showToast(message))),
    )
}
