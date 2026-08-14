import { Atom } from '@effect/atom-vue'

/**
 * Pinch-zoom shrinks `visualViewport.height` exactly like a keyboard does, so
 * a zoomed page would otherwise report a huge phantom inset. Anything above
 * this scale is treated as "the user zoomed", not "the keyboard opened".
 */
const MAX_UNZOOMED_SCALE = 1.05

/**
 * Tracks the on-screen keyboard height as a `--keyboard-inset` CSS variable
 * on <html>. Bottom sheets position themselves above the keyboard with
 * `bottom: var(--keyboard-inset, 0px)` — see ui/dialog/DialogContent.vue.
 *
 * An `EffectAtom`, so its tier is decided for it: the whole of it is a
 * subscription to a platform API that writes to the document, which is exactly
 * what the unit tier cannot see and the browser tier exists for. App.vue
 * subscribes once with `useAtomValue`.
 */
export const keyboardInsetEffectAtom = Atom.make((get) => {
  const viewport = globalThis.visualViewport
  if (!viewport) return null

  const update = (): void => {
    const isZoomed = viewport.scale > MAX_UNZOOMED_SCALE
    const inset = isZoomed
      ? 0
      : Math.max(0, globalThis.innerHeight - viewport.height - viewport.offsetTop)
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`)
  }

  // `scroll` matters as much as `resize`: iOS pans the visual viewport when
  // the keyboard opens, changing `offsetTop` without ever firing a resize.
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  get.addFinalizer(() => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
  })

  update()
  return null
}).pipe(Atom.keepAlive)
