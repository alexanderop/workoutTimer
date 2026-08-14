import { Atom, type AtomRegistry } from '@effect/atom-vue'
import { Effect, Schedule } from 'effect'
import { finishSession, markSessionRunning, sessionMutation, type DbServices } from '@/db'
import { currentSessionAtom, nowAtom, runDerivedTimerAtom } from '@/features/timer/atoms'
import { deriveTimer, SECOND_MS } from '@/features/timer/domain'
import { emitTimerCue } from '@/features/timer/timerFeedback'
import { i18n } from '@/i18n'
import { RouteNames } from '@/router'
import { navigationAtom } from '@/state/route'
import { timerSettingsValueAtom } from '@/state/timerData'
import { showToastIn } from '@/state/toast'

/**
 * The running timer's state machine.
 *
 * This was a `watch([session, now])` inside `TimerRunView.vue` — a hundred
 * lines of transition logic in a `<script setup>` block, invisible to the arch
 * tests and reachable only by rendering the screen. As an atom it is a
 * function of three inputs (the session, the clock, the preferences) that
 * fires writes when the workout crosses a boundary, and a test can drive it by
 * seeding a registry.
 *
 * Three rules, in order:
 *
 * 1. A finished workout belongs to the result screen. Falling out of the
 *    driver rather than out of the write that finished it is what removed the
 *    `transitionPending` flag: navigation follows the *data*, so it happens
 *    once the write has actually landed, whoever caused it.
 * 2. The countdown ends when wall-clock time reaches `startedAt`.
 * 3. The workout ends when `deriveTimer` says it is complete.
 *
 * A transition whose write fails after its retries is not attempted again: the
 * guard below stays set, so the workout stays where it is with one toast rather
 * than a write and a toast every tick. The screen's own Pause / Finish / Cancel
 * controls are still live, and are the way out of it.
 *
 * Only `TimerRunView` subscribes, so none of this runs anywhere else.
 */

/**
 * At most one write per (session, transition). The repository is idempotent —
 * `markSessionRunning` ignores a session that is no longer counting down, and
 * `finishSession` ignores one that is already over — but the read below re-runs
 * on every tick, and firing ten writes a second at a table while waiting for
 * the read to catch up is not something correctness should have to absorb.
 *
 * An atom rather than a module-level `let`, because the guard belongs to the
 * registry driving the workout: a `let` here would be shared by every registry,
 * which is exactly what a browser test's fresh-registry-per-render arrangement
 * would trip over. `keepAlive` so it outlives the driver's own subscription —
 * the guard has to survive the read that set it.
 */
const lastTransitionAtom: Atom.Writable<string | undefined> = Atom.make<string | undefined>(
  undefined,
).pipe(Atom.keepAlive)

/**
 * A write that fails is worth another go — IndexedDB refusing once is usually
 * a blocked or briefly-unavailable connection, not a broken database. Bounded
 * and spaced, because the alternative the old `transitionPending` flag had was
 * retrying on the very next tick, forever.
 */
const RETRY_POLICY = { times: 3, schedule: Schedule.spaced('500 millis') } as const

const report = (operation: string) => (error: { readonly _tag: string }) =>
  Effect.logError(error).pipe(
    Effect.annotateLogs({ boundary: 'timer-run', operation, failure: error._tag }),
  )

function fire(
  registry: AtomRegistry.AtomRegistry,
  transition: string,
  program: Effect.Effect<unknown, never, DbServices>,
): void {
  if (registry.get(lastTransitionAtom) === transition) return
  registry.set(lastTransitionAtom, transition)
  registry.set(sessionMutation, program)
}

export const timerRunDriverAtom = Atom.make((get): null => {
  const session = get(currentSessionAtom)
  if (session === undefined) return null

  const registry = get.registry

  if (session.status === 'completed') {
    get.set(navigationAtom, {
      name: RouteNames.timerResult,
      params: { id: session.id },
      replace: true,
    })
    return null
  }
  if (session.status === 'cancelled') return null

  const now = get(nowAtom)

  if (session.status === 'countdown') {
    if (now >= session.startedAt) {
      fire(
        registry,
        `${session.id}:running`,
        markSessionRunning(session.id).pipe(
          Effect.retry(RETRY_POLICY),
          Effect.catchTag('Db.DatabaseError', (error) =>
            report('start workout')(error).pipe(
              Effect.andThen(
                Effect.sync(() => showToastIn(registry, i18n.global.t('timer.run.saveFailed'))),
              ),
            ),
          ),
        ),
      )
    }
    return null
  }

  if (!deriveTimer(session, now).isComplete) return null

  const settings = get(timerSettingsValueAtom)
  const reason = session.config.mode === 'forTime' ? 'timeCap' : 'endpoint'
  fire(
    registry,
    `${session.id}:finished`,
    finishSession(session.id, reason).pipe(
      Effect.retry(RETRY_POLICY),
      Effect.tap(() => Effect.sync(() => emitTimerCue(settings, 'complete'))),
      Effect.catchTag('Db.DatabaseError', (error) =>
        report('finish workout')(error).pipe(
          Effect.andThen(
            Effect.sync(() => showToastIn(registry, i18n.global.t('timer.run.saveFailed'))),
          ),
        ),
      ),
    ),
  )
  return null
})

/**
 * The audible half of the same screen: a cue on every phase change, and one
 * per second over the last three.
 *
 * The two `let`s below are the reason this is a subscription rather than a
 * dependency of `timerRunDriverAtom`'s read. "Did the phase change?" needs the
 * previous phase, so the reaction has to outlive a single evaluation — and
 * reading the settings through the registry rather than with `get` keeps a
 * volume change from restarting the sequence and re-announcing "3".
 */
export const timerCueAtom = Atom.make((get): null => {
  let previousPhase: string | undefined
  let previousCountdownSecond: number | undefined

  get.subscribe(
    runDerivedTimerAtom,
    (state) => {
      if (state === undefined || state.phase === 'finished') return
      const settings = get.registry.get(timerSettingsValueAtom)

      if (previousPhase !== undefined && previousPhase !== state.phase) {
        emitTimerCue(settings, 'phase')
      }
      previousPhase = state.phase

      const second = Math.ceil(state.primaryMs / SECOND_MS)
      if (second <= 3 && second > 0 && second !== previousCountdownSecond) {
        emitTimerCue(settings, 'countdown', String(second))
      }
      previousCountdownSecond = second
    },
    { immediate: true },
  )

  return null
})
