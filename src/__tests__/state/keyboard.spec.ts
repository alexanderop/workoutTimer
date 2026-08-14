import { AtomRegistry } from '@effect/atom-vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keyboardInsetEffectAtom } from '@/state/keyboard'

/**
 * visualViewport is a browser API and its properties are read-only, so it is
 * stubbed here — a system boundary, which is the one thing these tests mock.
 */
class FakeVisualViewport extends EventTarget {
  height = window.innerHeight
  offsetTop = 0
  scale = 1
}

function readInset(): string {
  return document.documentElement.style.getPropertyValue('--keyboard-inset')
}

/**
 * Subscribing is what runs the atom's read, and the read is what attaches the
 * listeners — this is `useKeyboardInset()` without a component to own it. A
 * fresh registry per test also means a fresh read, which is what lets each
 * test install its own stubbed viewport.
 */
function mount(viewport: FakeVisualViewport): () => void {
  vi.stubGlobal('visualViewport', viewport)
  const registry = AtomRegistry.make()
  return registry.subscribe(keyboardInsetEffectAtom, () => {}, { immediate: true })
}

describe('keyboardInsetEffectAtom', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--keyboard-inset')
  })

  it('reports the keyboard height on resize', () => {
    const viewport = new FakeVisualViewport()
    const stop = mount(viewport)

    expect(readInset()).toBe('0px')

    viewport.height = window.innerHeight - 300
    viewport.dispatchEvent(new Event('resize'))

    expect(readInset()).toBe('300px')
    stop()
  })

  it('follows offsetTop changes that only fire a scroll event', () => {
    const viewport = new FakeVisualViewport()
    const stop = mount(viewport)

    // iOS pans the visual viewport when the keyboard opens: offsetTop moves
    // without a resize ever firing.
    viewport.height = window.innerHeight - 250
    viewport.offsetTop = 50
    viewport.dispatchEvent(new Event('scroll'))

    expect(readInset()).toBe('200px')
    stop()
  })

  it('treats a pinch-zoomed viewport as having no keyboard', () => {
    const viewport = new FakeVisualViewport()
    const stop = mount(viewport)

    // Zooming shrinks the visual viewport exactly like a keyboard would.
    viewport.scale = 2
    viewport.height = window.innerHeight / 2
    viewport.dispatchEvent(new Event('resize'))

    expect(readInset()).toBe('0px')
    stop()
  })
})
