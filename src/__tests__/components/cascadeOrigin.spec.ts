import { afterEach, describe, expect, it } from 'vitest'

/**
 * The cascade rules a design system quietly depends on, asserted against a real
 * one. Paired with `src/__tests__/jsdom/cascadeOrigin.spec.ts`, which runs the
 * same three cases and records the opposite answer in every one.
 *
 * These are not hypotheticals. Each maps to something this repo ships:
 *
 * - Author-over-user-agent is why `a { color: … }` in `src/style.css` is
 *   allowed to be a bare tag selector instead of a defensive `a:link`.
 * - Print sheets are how an export view would be styled without touching the
 *   screen rendering.
 * - `!important` ranked by specificity is what makes a narrowly-scoped override
 *   safe to add next to a broad one.
 *
 * A simulated DOM answers all three wrongly while looking like it applied your
 * CSS, so these assertions cannot live in any other tier.
 */
const styles: Array<HTMLStyleElement> = []

function css(text: string, media?: string): void {
  const style = document.createElement('style')
  if (media !== undefined) style.setAttribute('media', media)
  style.textContent = text
  document.head.append(style)
  styles.push(style)
}

afterEach(() => {
  for (const style of styles.splice(0)) style.remove()
  document.body.replaceChildren()
})

describe('author styles outrank the user-agent stylesheet', () => {
  it('applies a bare tag rule over the built-in link colour', () => {
    css(`a { color: rgb(255, 0, 0); }`)

    const link = document.createElement('a')
    link.href = 'https://example.com'
    link.textContent = 'Export backup'
    document.body.append(link)

    expect(
      getComputedStyle(link).color,
      'the user-agent :link colour won. Author origin outranks user-agent origin before specificity is consulted, so if this fails the cascade is not being resolved by a real engine.',
    ).toBe('rgb(255, 0, 0)')
  })
})

describe('a print stylesheet does not style the screen', () => {
  it('ignores a sheet whose media attribute excludes this medium', () => {
    css(`.sheet-only { color: rgb(7, 7, 7); }`, 'print')

    const element = document.createElement('p')
    element.className = 'sheet-only'
    document.body.append(element)

    expect(
      getComputedStyle(element).color,
      'a print-only rule reached the screen. Sheet-level `media` has to gate the whole sheet, or print styling silently changes what every other assertion in the suite measures.',
    ).not.toBe('rgb(7, 7, 7)')
  })
})

describe('!important is still ranked by specificity', () => {
  it('keeps the more specific of two important declarations', () => {
    css(`
      #hero { color: rgb(0, 0, 255) !important; }
      p.para { color: rgb(255, 0, 0) !important; }
    `)

    const paragraph = document.createElement('p')
    paragraph.id = 'hero'
    paragraph.className = 'para'
    document.body.append(paragraph)

    expect(
      getComputedStyle(paragraph).color,
      'the later important declaration won on source order. `#hero` is (1,0,0) against `p.para` at (0,1,1) — if importance collapses to last-one-wins, every targeted override becomes order-dependent.',
    ).toBe('rgb(0, 0, 255)')
  })
})
