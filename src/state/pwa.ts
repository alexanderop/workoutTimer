import { Atom } from '@effect/atom-vue'
import { hintVisibleAtom } from '@/state/install'
import { needRefreshAtom } from '@/state/swUpdate'

/**
 * The install banner and the update banner occupy the same strip above the tab
 * bar, so only one may show. An available update wins: it is the one the user
 * cannot act on later.
 *
 * The arbitration lives here rather than in `PwaInstallPrompt.vue` because it
 * is a rule about two pieces of state, not about a component — and because an
 * atom declared in `<script setup>` would be rebuilt on every mount.
 *
 * A value atom over two value atoms, which is why it is a four-case unit test
 * (`src/__tests__/unit/state/pwa.spec.ts`) and not a browser one.
 */
export const bannerVisibleAtom = Atom.make((get) => get(hintVisibleAtom) && !get(needRefreshAtom))
