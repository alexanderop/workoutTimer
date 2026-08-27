import { Layer } from 'effect'
import { ObservabilityLayer } from '@/lib/observability'
import { PresetsRepo } from './repositories/presets'
import { RestoreRepo } from './repositories/restore'
import { SessionsRepo } from './repositories/sessions'
import { SettingsRepo } from './repositories/settings'

/**
 * The one layer stack, built once and used by both runtimes (`./atoms.ts` for
 * the UI, `./runtime.ts` behind `runDb`). They are separate contexts, so a
 * repository merged into one is invisible to the other — a new layer goes
 * here and nowhere else.
 */
export const dbLayer = Layer.mergeAll(
  SessionsRepo.layer,
  PresetsRepo.layer,
  SettingsRepo.layer,
  RestoreRepo.layer,
  ObservabilityLayer,
)

/**
 * What a program handed to a mutation atom or to `runDb` may require.
 *
 * A union, so a program that only reads presets still satisfies it —
 * `Effect`'s requirement channel is covariant, so the narrower requirement is
 * assignable to the wider one and nothing has to name every repository it
 * does not use.
 */
export type DbServices = SessionsRepo | PresetsRepo | SettingsRepo | RestoreRepo
