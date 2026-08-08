import { Atom } from '@effect/atom-vue'
import type { Effect } from 'effect'
import { dbLayer, type DbServices } from './layer'

export const SESSIONS_KEY = 'sessions'
export const PRESETS_KEY = 'presets'
export const SETTINGS_KEY = 'timer-settings'

export const dbRuntime = Atom.runtime(dbLayer)

/**
 * A write edge into the database. Programs must already have `never` in the
 * error channel — every tagged failure handled inside Effect — and a landed
 * write invalidates `reactivityKeys`, so the read atoms built on those keys
 * re-read from disk without anyone asking them to.
 *
 * There is one of these per *set of tables a write can touch*, rather than a
 * single edge that invalidates everything. Over-invalidating is not merely
 * wasteful: a re-read hands components a fresh array of freshly decoded
 * objects, and any watcher keyed on that identity fires. Pausing a timer used
 * to re-read presets, which re-ran the setup screen's "load preset into the
 * form" watcher and wiped whatever the user had just typed. Invalidating only
 * what a write actually changed keeps that class of bug from existing.
 */
const mutationAtom = (reactivityKeys: ReadonlyArray<string>) =>
  dbRuntime.fn((program: Effect.Effect<unknown, never, DbServices>) => program, {
    reactivityKeys,
    concurrent: true,
  })

/** Timer state: create, pause, resume, split, finish, delete. */
export const sessionMutation = mutationAtom([SESSIONS_KEY])

/** Preset CRUD. */
export const presetMutation = mutationAtom([PRESETS_KEY])

/** Timer preferences. */
export const settingsMutation = mutationAtom([SETTINGS_KEY])

/** Starting a workout: writes the session *and* stamps the preset's `lastUsedAt`. */
export const workoutStartMutation = mutationAtom([SESSIONS_KEY, PRESETS_KEY])

/** Restoring a backup replaces every table, so it invalidates every key. */
export const restoreMutation = mutationAtom([SESSIONS_KEY, PRESETS_KEY, SETTINGS_KEY])
