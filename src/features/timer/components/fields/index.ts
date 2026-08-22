import type { Component } from 'vue'
import type { TimerMode } from '@/db'
import type { TimerSetupDraft } from '@/features/timer/setupForm'
import AmrapFields from './AmrapFields.vue'
import CircuitFields from './CircuitFields.vue'
import EmomFields from './EmomFields.vue'
import ForTimeFields from './ForTimeFields.vue'
import TabataFields from './TabataFields.vue'

/**
 * Which fields each mode is set up with.
 *
 * The setup screen used to spell this as a `v-if` / `v-else-if` chain over
 * four mode names with the circuit editor on the `v-else` — the same dispatch
 * the arch tier bans in script form, written in a template where it could not
 * be seen. As a record keyed by `TimerMode` a sixth mode is a compile error
 * here, and the screen renders whatever the map hands it.
 *
 * Every entry takes the whole `draft` and emits the fields it changed, so the
 * screen's own job is one line: fold the patch into the draft atom. A mode
 * whose fields grow does not touch the screen.
 */
export type ModeFields = Component<{ draft: TimerSetupDraft }>

export const MODE_FIELDS: Readonly<Record<TimerMode, ModeFields>> = {
  amrap: AmrapFields,
  forTime: ForTimeFields,
  emom: EmomFields,
  tabata: TabataFields,
  custom: CircuitFields,
}
