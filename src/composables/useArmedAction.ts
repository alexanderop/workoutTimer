import { onScopeDispose, ref } from 'vue'

/**
 * Arm-then-confirm: the two-tap gesture that guards a destructive action with
 * no undo.
 *
 * The first tap arms and relabels the control ("Delete" → "Tap again to
 * delete"), the second commits, and a timeout disarms so a control cannot sit
 * armed indefinitely waiting for a stray thumb. This app uses it for deleting
 * a preset, deleting a workout, and finishing or cancelling a running timer —
 * all four of which had their own copy of the flag, the `setTimeout`, and the
 * `onBeforeUnmount` that cleared it. Four copies of a gesture is four places
 * for the timeout to be forgotten, and the cleanup is the half nobody
 * remembers: it is here, once, on scope dispose.
 *
 * `armFirst` answers the only question a caller has: *should I do it now?*
 *
 * ```ts
 * const { armed, armFirst } = useArmedAction()
 * function remove(preset: TimerPreset) {
 *   if (!armFirst(preset.id)) return          // first tap — armed, relabelled
 *   return runMutation(deletePreset(preset.id).pipe(…))
 * }
 * ```
 *
 * The key exists for a list: arming one row disarms every other, so a
 * four-icon row of presets can never have two rows armed at once. Callers
 * guarding a single control pass nothing.
 */
export interface ArmedAction {
  /** Whether this key — or the single control — is currently armed. */
  readonly isArmed: (key?: string) => boolean
  /** Arms on the first call and returns false; returns true on the second. */
  readonly armFirst: (key?: string) => boolean
}

const SINGLE = 'single'

/** Long enough to be a deliberate second tap, short enough to forget about. */
const DISARM_AFTER_MS = 3_000

export function useArmedAction(disarmAfterMs: number = DISARM_AFTER_MS): ArmedAction {
  const armedKey = ref<string | undefined>()
  let disarmTimeout: ReturnType<typeof setTimeout> | undefined

  function disarm(): void {
    // No guard: clearTimeout of an already-cleared or never-set handle is a
    // no-op in both the DOM and Node, so checking first only adds a branch
    // nothing can distinguish.
    clearTimeout(disarmTimeout)
    disarmTimeout = undefined
    armedKey.value = undefined
  }

  // A component can be unmounted while armed — navigating away from a preset
  // list, or the run screen replacing itself on finish. Without this the
  // timeout would still fire, into a scope that no longer exists.
  onScopeDispose(disarm)

  function armFirst(key: string = SINGLE): boolean {
    if (armedKey.value === key) {
      disarm()
      return true
    }

    disarm()
    armedKey.value = key
    disarmTimeout = setTimeout(disarm, disarmAfterMs)

    return false
  }

  return {
    isArmed: (key: string = SINGLE) => armedKey.value === key,
    armFirst,
  }
}
