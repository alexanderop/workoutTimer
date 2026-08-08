import { Atom } from '@effect/atom-vue'
import type { Effect } from 'effect'
import { dbLayer, type DbServices } from './layer'

export const SESSIONS_KEY = 'sessions'
export const PRESETS_KEY = 'presets'
export const SETTINGS_KEY = 'timer-settings'

export const dbRuntime = Atom.runtime(dbLayer)

export const dbMutation = dbRuntime.fn(
  (program: Effect.Effect<unknown, never, DbServices>) => program,
  { reactivityKeys: [SESSIONS_KEY, PRESETS_KEY, SETTINGS_KEY], concurrent: true },
)
