import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserOnly, env } from '@/__tests__/helpers/env'

/**
 * Scrolling, asserted as a position rather than as a number someone assigned.
 *
 * The same container is built in both environments and answers differently at
 * every step. `scrollTop` is the dangerous one, because it is *present and
 * writable* in jsdom: declared as a plain data field in the Element constructor
 * (`this.scrollTop = 0`) with no getter, no setter, and no clamping. Whatever
 * you assign is what you read back. In a browser it is clamped to
 * `scrollHeight - clientHeight`, which for a non-scrolling element is `0`.
 *
 * So a virtualised-list test writes 5000, reads 5000, computes a window of rows
 * from it, and passes — while the same code in a browser clamps to 0 and
 * renders the first row. That is not a test that fails to catch a bug. It is a
 * test that manufactures confidence.
 *
 * The question only the browser column can ask — *did the selected option end
 * up visible?* — is the one `TimePicker` needs. It centres the pressed option
 * on mount:
 *
 *     scroller.value?.querySelector('[aria-pressed="true"]')
 *       ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
 *
 * In jsdom that method does not exist, and stubbing it converts a behaviour
 * test into a call-signature test: recording the arguments proves the call
 * happened, not that anything moved.
 */
const expected = {
  jsdom: {
    hasExtent: false,
    clampsPastEnd: false,
    clampsNegative: false,
    firesScrollEvent: false,
    hasScrollIntoView: false,
  },
  browser: {
    hasExtent: true,
    clampsPastEnd: true,
    clampsNegative: true,
    firesScrollEvent: true,
    hasScrollIntoView: true,
  },
}[env]

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

/** Resolves to whether `condition` became true within `timeout`. */
async function becomesTrue(condition: () => boolean, timeout = 300): Promise<boolean> {
  const deadline = performance.now() + timeout
  while (performance.now() < deadline) {
    if (condition()) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return condition()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the container has a scrollable extent, or has none', () => {
  it('reports more content than it can show', () => {
    const { container } = scroller()

    expect(
      container.scrollHeight > container.clientHeight,
      'with no layout engine every box is zero-sized, so content can never overflow one and every scroll assertion below is measuring nothing',
    ).toBe(expected.hasExtent)
  })
})

describe('scrollTop is a position, or a field', () => {
  it('clamps a write past the end to the maximum offset', () => {
    const { container } = scroller()
    const maximum = container.scrollHeight - container.clientHeight

    container.scrollTop = 5000

    expect(
      container.scrollTop,
      'code that derives a visible window from scrollTop is only correct if the value is clamped. Where 5000 is stored verbatim on a container whose scrollable extent is zero, the three numbers are mutually impossible and the test still passes.',
    ).toBe(expected.clampsPastEnd ? maximum : 5000)
  })

  it('clamps a negative offset to the start', () => {
    const { container } = scroller()
    container.scrollTop = 200

    container.scrollTop = -5

    expect(container.scrollTop).toBe(expected.clampsNegative ? 0 : -5)
  })
})

describe('a scroll event arrives on its own, or not at all', () => {
  it('notifies a listener without the test dispatching one', async () => {
    const { container } = scroller()
    const onScroll = vi.fn()
    container.addEventListener('scroll', onScroll)

    container.scrollTop = 200

    expect(
      await becomesTrue(() => onScroll.mock.calls.length > 0),
      'where no scroll event is ever emitted, any handler under test only runs because the test dispatched one by hand — so "scrolling loads the next page" really asserts that calling my handler calls my handler',
    ).toBe(expected.firesScrollEvent)
  })
})

describe('scrollIntoView moves the element into view', () => {
  it('exists as a method', () => {
    const { rows } = scroller()

    expect(
      typeof rows[40].scrollIntoView === 'function',
      'the method is missing, so the call throws until it is stubbed — and a stub can only record its arguments',
    ).toBe(expected.hasScrollIntoView)
  })

  browserOnly('brings an off-screen row inside its container', () => {
    const { container, rows } = scroller()
    const target = rows[40]

    expect(
      isInsideViewOf(target, container),
      'row 40 was already visible, so scrolling to it would prove nothing',
    ).toBe(false)

    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })

    expect(
      isInsideViewOf(target, container),
      'the row did not end up inside its container. This is the assertion a stubbed scrollIntoView cannot make.',
    ).toBe(true)
  })
})
