import { afterEach, describe, expect, it } from 'vitest'

/**
 * Counterpart to `src/__tests__/components/cascadeOrigin.spec.ts`.
 *
 * `cascade.spec.ts` covers rules that never reach the cascade at all. This file
 * covers the opposite failure: rules that reach it and are then ranked wrongly.
 *
 * jsdom 30 genuinely computes specificity — `@bramus/specificity` was wired in
 * for v28.1.0 — which makes these three results more surprising than a flat
 * "not implemented", and much harder to notice. The cascade is *nearly* right,
 * so its answers look like answers.
 *
 * Every assertion below is jsdom's wrong answer. The browser spec asserts the
 * right one against the same markup.
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

describe('the user-agent sheet competes with yours on equal terms', () => {
  it('lets the UA link colour beat an author rule', () => {
    css(`a { color: rgb(255, 0, 0); }`)

    const link = document.createElement('a')
    link.href = 'https://example.com'
    link.textContent = 'Export backup'
    document.body.append(link)

    // jsdom loads the UA sheet into the same pass as your stylesheet, sharing
    // one specificity map with no origin weighting. The UA's `:link` selector
    // is (0,1,0); your `a` is (0,0,1), so the UA wins on the number and your
    // declaration is discarded. In a browser, author origin outranks user-agent
    // origin before specificity is even consulted.
    expect(getComputedStyle(link).color).toBe('rgb(0, 0, 238)')
  })
})

describe('a print stylesheet applies to the screen', () => {
  it('honours rules from a sheet this medium should never see', () => {
    css(`.sheet-only { color: rgb(7, 7, 7); }`, 'print')

    const element = document.createElement('p')
    element.className = 'sheet-only'
    document.body.append(element)

    // The cascade reads `sheet.cssRules` directly and never consults
    // `sheet.media`, so the `media` attribute is parsed, stored, exposed on the
    // CSSOM — and ignored. Only `@media` blocks *inside* a sheet are gated, and
    // those are gated by string equality (see cascade.spec.ts).
    expect(getComputedStyle(element).color).toBe('rgb(7, 7, 7)')
  })
})

describe('!important throws specificity away', () => {
  it('ranks two important declarations by source order alone', () => {
    css(`
      #hero { color: rgb(0, 0, 255) !important; }
      p.para { color: rgb(255, 0, 0) !important; }
    `)

    const paragraph = document.createElement('p')
    paragraph.id = 'hero'
    paragraph.className = 'para'
    document.body.append(paragraph)

    // Among important declarations jsdom is pure last-one-wins: the branch that
    // handles `priority` overwrites unconditionally and never records a
    // specificity to compare against. `#hero` is (1,0,0) and `p.para` is
    // (0,1,1), so a browser keeps the blue.
    expect(getComputedStyle(paragraph).color).toBe('rgb(255, 0, 0)')
  })
})
