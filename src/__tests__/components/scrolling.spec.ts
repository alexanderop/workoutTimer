import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Scrolling, asserted as a position rather than as a number someone assigned.
 * Paired with `src/__tests__/jsdom/scrolling.spec.ts`, where every assertion
 * below is either impossible or answers the other way.
 *
 * The question this tier can ask and no simulated DOM can — *did the selected
 * option end up visible?* — is exactly the one `TimePicker` needs. It centres
 * the pressed option on mount:
 *
 *     scroller.value?.querySelector('[aria-pressed="true"]')
 *       ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
 *
 * In jsdom that call throws until you stub it, and a stub can only record its
 * arguments. Here the row moves, and "moved into view" is a geometry
 * comparison against the container it moved inside.
 */
const ROW_HEIGHT = 20
const VISIBLE_HEIGHT = 100

function scroller(): { container: HTMLElement; rows: Array<HTMLElement> } {
  const container = document.createElement('div')
  container.style.cssText = `overflow-y: auto; height: ${VISIBLE_HEIGHT}px;`

  const rows = Array.from({ length: 50 }, (_, index) => {
    const row = document.createElement('p')
    row.textContent = `row ${index}`
    row.style.cssText = `height: ${ROW_HEIGHT}px; margin: 0;`
    container.append(row)
    return row
  })

  document.body.append(container)
  return { container, rows }
}

function isInsideViewOf(row: HTMLElement, container: HTMLElement): boolean {
  const rowBox = row.getBoundingClientRect()
  const containerBox = container.getBoundingClientRect()
  return rowBox.top >= containerBox.top && rowBox.bottom <= containerBox.bottom
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('a scroll container has a real extent', () => {
  it('reports more content than it can show', () => {
    const { container } = scroller()

    expect(
      container.scrollHeight,
      'the container has no scrollable extent, so every scroll assertion below would be vacuous',
    ).toBeGreaterThan(container.clientHeight)
  })

  it('clamps a write past the end to the maximum offset', () => {
    const { container } = scroller()
    const maximum = container.scrollHeight - container.clientHeight

    container.scrollTop = 5000

    expect(
      container.scrollTop,
      'scrollTop accepted a value past the end of the content. It is a position, not a field — code that derives a visible window from it is only correct if the browser clamps.',
    ).toBe(maximum)
  })

  it('clamps a negative offset to the start', () => {
    const { container } = scroller()
    container.scrollTop = 200

    container.scrollTop = -5

    expect(container.scrollTop).toBe(0)
  })
})

describe('scrolling fires a scroll event', () => {
  it('notifies a listener without the test dispatching one', async () => {
    const { container } = scroller()
    const onScroll = vi.fn()
    container.addEventListener('scroll', onScroll)

    container.scrollTop = 200

    // Real scroll events are asynchronous, which is itself the point: a
    // handler that runs synchronously in jsdom runs a frame later here.
    await vi.waitFor(() => expect(onScroll).toHaveBeenCalled())
  })
})

describe('scrollIntoView moves the element into view', () => {
  it('brings an off-screen row inside its container', () => {
    const { container, rows } = scroller()
    const target = rows[40]

    expect(
      isInsideViewOf(target, container),
      'row 40 was already visible, so scrolling to it would prove nothing',
    ).toBe(false)

    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })

    expect(
      isInsideViewOf(target, container),
      'the row did not end up inside its container. This is the assertion a stubbed scrollIntoView cannot make: recording the arguments proves the call happened, not that anything moved.',
    ).toBe(true)
  })
})
