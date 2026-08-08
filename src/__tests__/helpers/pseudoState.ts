// Vitest declares `CDPSession` as an empty interface and lets the provider fill
// it in; `@vitest/browser-playwright` is what adds `send`. tsconfig.vitest.json
// pins `types` to ["node"], so that augmentation has to be pulled in by hand or
// every `session.send` below is a TS2339.
/// <reference types="@vitest/browser-playwright" />
import { cdp } from 'vitest/browser'

/**
 * Forces CSS pseudo states through the Chrome DevTools Protocol, so a
 * screenshot can show `hover:` / `focus-visible:` / `active:` variants that no
 * amount of pointer scripting can hold still.
 *
 * `page.hover()` moves one real cursor: it cannot hold hover on six buttons at
 * once for a grid shot, and it cannot combine hover with focus on the same
 * element. `CSS.forcePseudoState` is what DevTools' own "toggle element state"
 * panel calls, so the states are real — user-agent defaults included — rather
 * than a stylesheet rewritten to swap `:hover` for a class. It is available
 * because the browser tier runs Chromium through Playwright, which exposes a
 * CDP session; `@vitest/browser-playwright` augments Vitest's empty
 * `CDPSession` type with Playwright's `send`.
 *
 * Forcing is bound to the node and survives until the node is discarded, so a
 * test that unmounts between cases needs no teardown. Call with an empty array
 * to release a node early.
 */
const PSEUDO_STATES = ['hover', 'focus', 'focus-visible', 'active', 'visited'] as const

export type PseudoState = (typeof PSEUDO_STATES)[number]

/** Marks the target so CDP can find it by selector rather than by reference. */
const TARGET_ATTRIBUTE = 'data-pseudo-target'

let counter = 0

/**
 * Accepts one element or many so a grid shot and a single-control shot use the
 * same call. Forcing is per node, so the states are applied in sequence.
 */
export async function forcePseudoState(
  target: Element | Iterable<Element>,
  states: readonly PseudoState[],
): Promise<void> {
  const session = cdp()
  await session.send('DOM.enable')
  await session.send('CSS.enable')

  const elements = target instanceof Element ? [target] : [...target]

  for (const element of elements) {
    const token = `pseudo-${(counter += 1)}`
    element.setAttribute(TARGET_ATTRIBUTE, token)

    try {
      await session.send('CSS.forcePseudoState', {
        nodeId: await resolveNodeId(session, `[${TARGET_ATTRIBUTE}="${token}"]`),
        forcedPseudoClasses: [...states],
      })
    } finally {
      element.removeAttribute(TARGET_ATTRIBUTE)
    }
  }
}

type Session = ReturnType<typeof cdp>

/**
 * Browser-tier specs execute inside Vitest's tester iframe, so querying from
 * the top document returns nodeId 0 for anything the test rendered — the
 * failure is silent until `forcePseudoState` rejects with "Could not find node
 * with given id". Descend into the iframe's content document first.
 *
 * The `pierce` walk is what populates the frontend node map; without it the
 * described iframe carries no `contentDocument`. Ids are not cached because a
 * spec may remount into a fresh iframe between tests.
 */
async function resolveNodeId(session: Session, selector: string): Promise<number> {
  const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true })

  const { nodeId: iframeId } = await session.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'iframe',
  })
  if (iframeId === 0) throw new Error('pseudoState: no tester iframe found')

  const { node } = await session.send('DOM.describeNode', { nodeId: iframeId, pierce: true })
  const backendNodeId = node.contentDocument?.backendNodeId
  if (backendNodeId === undefined) throw new Error('pseudoState: iframe has no contentDocument')

  const { nodeIds } = await session.send('DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId],
  })

  const { nodeId } = await session.send('DOM.querySelector', {
    nodeId: nodeIds[0],
    selector,
  })
  if (nodeId === 0) throw new Error(`pseudoState: no node matched ${selector}`)

  return nodeId
}
