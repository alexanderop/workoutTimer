import { Clock, Context, Effect, Layer } from 'effect'
import { decodePresetDraft, decodeTimerPreset } from '../converters'
import type { PresetDraft, TimerPreset } from '../converters'
import type { DatabaseError, WorkoutInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { decodeRow, tryDb, validateDraft } from './shared'

const decodePresetRow = decodeRow('decode preset row', decodeTimerPreset)
const validatePresetDraft = validateDraft(decodePresetDraft)

/** Saved timer setups. Plain CRUD — a preset is not part of any transaction. */
export class PresetsRepo extends Context.Service<
  PresetsRepo,
  {
    listPresets: () => Effect.Effect<Array<TimerPreset>, DatabaseError>
    createPreset: (
      draft: PresetDraft,
    ) => Effect.Effect<TimerPreset, DatabaseError | WorkoutInvalidError>
    updatePreset: (
      id: string,
      draft: PresetDraft,
    ) => Effect.Effect<void, DatabaseError | WorkoutInvalidError>
    deletePreset: (id: string) => Effect.Effect<void, DatabaseError>
  }
>()('workout-timer/db/PresetsRepo') {
  static readonly layer = Layer.effect(
    PresetsRepo,
    Effect.gen(function* () {
      const generateId = yield* GenerateId

      return PresetsRepo.of({
        listPresets: Effect.fn('PresetsRepo.listPresets')(function* () {
          const rows = yield* tryDb('list presets', () => db.presets.toArray())
          return yield* Effect.forEach(rows, decodePresetRow)
        }),

        createPreset: Effect.fn('PresetsRepo.createPreset')(function* (draft: PresetDraft) {
          const valid = yield* validatePresetDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const preset: TimerPreset = {
            id: generateId(),
            name: valid.name,
            config: valid.config,
            workoutNotes: valid.workoutNotes,
            createdAt: now,
            updatedAt: now,
          }
          yield* tryDb('create preset', async () => db.presets.add(preset))
          return preset
        }),

        updatePreset: Effect.fn('PresetsRepo.updatePreset')(function* (
          id: string,
          draft: PresetDraft,
        ) {
          const valid = yield* validatePresetDraft(draft)
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('update preset', async () => {
            await db.presets.update(id, { ...valid, updatedAt: now })
          })
        }),

        deletePreset: Effect.fn('PresetsRepo.deletePreset')(function* (id: string) {
          yield* tryDb('delete preset', async () => db.presets.delete(id))
        }),
      })
    }),
  )
}

export const listPresets = PresetsRepo.use((repo) => repo.listPresets())
export const createPreset = (draft: PresetDraft) =>
  PresetsRepo.use((repo) => repo.createPreset(draft))
export const updatePreset = (id: string, draft: PresetDraft) =>
  PresetsRepo.use((repo) => repo.updatePreset(id, draft))
export const deletePreset = (id: string) => PresetsRepo.use((repo) => repo.deletePreset(id))
