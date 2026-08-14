import { Atom } from '@effect/atom-vue'

/**
 * "This action is in flight", keyed by action name.
 *
 * Every screen had one or two of these as a local `ref` — `isSaving`,
 * `isStarting`, `isSavingPreset`, `transitionPending` — each guarding a
 * double-submit and each disabling a button. They are the same fact about the
 * same kind of thing, so they share one family rather than one declaration
 * per screen.
 *
 * Not `keepAlive`: a flag whose screen is gone is not pending, and the reset
 * on unmount is the behaviour a `ref` gave for free.
 */
export const pendingAtom = Atom.family((_action: string) => Atom.make(false))
