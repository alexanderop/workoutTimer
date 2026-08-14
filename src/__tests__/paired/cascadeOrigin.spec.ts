import { afterEach, describe, expect, it } from 'vitest'
import { env } from '@/__tests__/helpers/env'

/**
 * The cascade rules a design system quietly depends on — read by both runners,
 * so each records its own answer to the same three questions.
 *
 * `cascade.spec.ts` covers rules that never reach the cascade at all. This file
 * covers the opposite failure: rules that reach it and are then ranked wrongly.
 * That is the harder one to notice. jsdom 30 genuinely computes specificity —
 * `@bramus/specificity` was wired in for v28.1.0 — so the cascade is *nearly*
 * right, and its answers look like answers.
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
 * jsdom answers all three wrongly while looking like it applied your CSS. The
 * table below is the whole finding: read down the `jsdom` column and every
 * value is one a browser would never produce.
 */
const expected = {
  jsdom: {
    // The UA sheet is loaded into the same pass as yours, sharing one
    // specificity map with no origin weighting. The UA's `:link` is (0,1,0),
    // your `a` is (0,0,1) — so the built-in blue wins and your rule is dropped.
    linkColor: 'rgb(0, 0, 238)',
    // The cascade reads `sheet.cssRules` directly and never consults
    // `sheet.media`, so the attribute is parsed, stored, exposed on the CSSOM
    // — and ignored. Only `@media` blocks *inside* a sheet are gated, and those
    // by string equality (see `src/__tests__/jsdom/cascade.spec.ts`).
    printSheetApplies: true,
    // Among important declarations jsdom is pure last-one-wins: the branch that
    // handles `priority` overwrites unconditionally and never records a
    // specificity to compare against.
    importantWinner: 'rgb(255, 0, 0)',
  },
  browser: {
    linkColor: 'rgb(255, 0, 0)',
    printSheetApplies: false,
    // `#hero` is (1,0,0) against `p.para` at (0,1,1).
    importantWinner: 'rgb(0, 0, 255)',
  },
}[env]

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

describe('author styles versus the user-agent stylesheet', () => {
  it('ranks a bare tag rule against the built-in link colour', () => {
    css(`a { color: rgb(255, 0, 0); }`)

    const link = document.createElement('a')
    link.href = 'https://example.com'
    link.textContent = 'Export backup'
    document.body.append(link)

    expect(
      getComputedStyle(link).color,
      'author origin outranks user-agent origin before specificity is consulted. Where it does not, the cascade is not being resolved by a real engine and every bare tag selector in src/style.css is being tested against the wrong winner.',
    ).toBe(expected.linkColor)
  })
})

describe('a print stylesheet against the screen', () => {
  it('decides whether a sheet this medium should never see applies', () => {
    css(`.sheet-only { color: rgb(7, 7, 7); }`, 'print')

    const element = document.createElement('p')
    element.className = 'sheet-only'
    document.body.append(element)

    expect(
      getComputedStyle(element).color === 'rgb(7, 7, 7)',
      'sheet-level `media` has to gate the whole sheet. Where it does not, print styling silently changes what every other assertion in the suite measures.',
    ).toBe(expected.printSheetApplies)
  })
})

describe('two !important declarations', () => {
  it('ranks them by specificity or by source order', () => {
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
      'where importance collapses to last-one-wins, every targeted override becomes order-dependent — and a test suite that agrees with it will not tell you.',
    ).toBe(expected.importantWinner)
  })
})
