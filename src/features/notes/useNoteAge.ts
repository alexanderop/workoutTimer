import { useTimestamp } from '@vueuse/core'
import { Effect } from 'effect'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import type { NoteAge } from './domain'
import { noteAge } from './domain'

/**
 * Reactive wrapper around the Clock-based `noteAge` program. The split
 * matters: Effect owns what "now" means (which is what makes the bucket
 * logic deterministic under TestClock), while this composable only decides
 * when the UI re-evaluates it — every 30 s, so a card on screen ages from
 * "just now" into "1 min ago" without a reload.
 */
export function useNoteAge(updatedAt: MaybeRefOrGetter<number>): ComputedRef<NoteAge> {
  const tick = useTimestamp({ interval: 30_000 })
  return computed(() => {
    // Subscribing to the ticker re-runs the program; the time it sees still
    // comes from the Clock service, not from this timestamp.
    void tick.value
    return Effect.runSync(noteAge(toValue(updatedAt)))
  })
}
