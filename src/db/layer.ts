import { Layer } from 'effect'
import { ObservabilityLayer } from '@/lib/observability'
import { WorkoutsRepo } from './repositories/workouts'

export const dbLayer = Layer.merge(WorkoutsRepo.layer, ObservabilityLayer)

export type DbServices = WorkoutsRepo
