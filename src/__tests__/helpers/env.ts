import { inject, it } from 'vitest'

/**
 * Which runner the current spec got.
 *
 * Specs under `src/__tests__/paired/` are included by both the `jsdom` project
 * and the browser projects, so a single file is read by two environments. This
 * is how it tells them apart.
 *
 * `inject` reads worker state that is populated before the test file is
 * imported, so calling it at module top level is fine — the value is available
 * at collection time, which is what `browserOnly` below needs.
 */
export const env = inject('env')

const isBrowser = env === 'browser'
const isJsdom = env === 'jsdom'

/**
 * A test that needs a capability only a real browser has: input driven through
 * the browser itself, a resolved cascade, layout, or a platform API jsdom does
 * not implement. Collected and skipped in the jsdom project.
 *
 * Reach for this only when the behaviour *cannot exist* under jsdom. When both
 * environments answer, and answer differently, assert the divergence instead —
 * key the expectations off `env` so one spec records both answers.
 */
export const browserOnly = it.runIf(isBrowser)

/**
 * The mirror image: a test whose subject only exists under a simulated DOM.
 * Almost always this is the realm problem — jsdom objects meeting Node
 * objects — which has no browser counterpart to assert because in a browser
 * there is only one realm and one `Blob`.
 *
 * Use it sparingly. Most jsdom findings are better stated as a divergence,
 * because a reader learns more from the browser's answer sitting next to it
 * than from a test the browser skips.
 */
export const jsdomOnly = it.runIf(isJsdom)
